import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { nanoid } from 'nanoid';
import { config } from './config.js';

function ensureDatabaseDirectory(databasePath) {
  if (databasePath === ':memory:') {
    return;
  }

  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
}

function parseJson(value, fallback) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function boolFromDb(value) {
  return Boolean(value);
}

function boolToDb(value) {
  return value ? 1 : 0;
}

function rowToUser(row) {
  return {
    user_hash: row.user_hash,
    nickname: row.nickname,
    domain_group: row.domain_group,
    trust_level: row.trust_level,
    roles: parseJson(row.roles, []),
    created_at: row.created_at,
    banned: boolFromDb(row.banned)
  };
}

function rowToSpace(row) {
  return {
    id: row.id,
    name: row.name,
    allowed_domains: parseJson(row.allowed_domains, []),
    created_at: row.created_at
  };
}

function rowToPost(row) {
  return {
    id: row.id,
    user_hash: row.user_hash,
    space_id: row.space_id,
    content: row.content,
    created_at: row.created_at,
    hidden: boolFromDb(row.hidden)
  };
}

function rowToComment(row) {
  return {
    id: row.id,
    post_id: row.post_id,
    user_hash: row.user_hash,
    content: row.content,
    created_at: row.created_at,
    hidden: boolFromDb(row.hidden)
  };
}

function rowToReport(row) {
  return {
    id: row.id,
    actor_hash: row.actor_hash,
    target_type: row.target_type,
    target_id: row.target_id,
    reason: row.reason,
    weight: row.weight,
    created_at: row.created_at
  };
}

function rowToModerationCase(row) {
  return {
    id: row.id,
    target_type: row.target_type,
    target_id: row.target_id,
    accused_hash: row.accused_hash,
    report_ids: parseJson(row.report_ids, []),
    status: row.status,
    votes: parseJson(row.votes, []),
    created_at: row.created_at,
    resolved_at: row.resolved_at,
    resolution: parseJson(row.resolution, null)
  };
}

function rowToAuditEvent(row) {
  return {
    id: row.id,
    operation: row.operation,
    actor_hash: row.actor_hash,
    target_hash: row.target_hash,
    target_type: row.target_type,
    target_id: row.target_id,
    reason: row.reason,
    created_at: row.created_at
  };
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      user_hash TEXT PRIMARY KEY,
      nickname TEXT UNIQUE,
      domain_group TEXT NOT NULL,
      trust_level INTEGER NOT NULL DEFAULT 0,
      roles TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      banned INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS magic_tokens (
      token TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      domain_group TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS spaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      allowed_domains TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      user_hash TEXT NOT NULL,
      space_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      hidden INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL,
      user_hash TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      hidden INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      actor_hash TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      weight INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(actor_hash, target_type, target_id)
    );

    CREATE TABLE IF NOT EXISTS moderation_cases (
      id TEXT PRIMARY KEY,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      accused_hash TEXT NOT NULL,
      report_ids TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL,
      votes TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      resolved_at TEXT,
      resolution TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      operation TEXT NOT NULL,
      actor_hash TEXT NOT NULL,
      target_hash TEXT,
      target_type TEXT,
      target_id TEXT,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_posts_space_id ON posts(space_id);
    CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id);
    CREATE INDEX IF NOT EXISTS idx_reports_target ON reports(target_type, target_id);
    CREATE INDEX IF NOT EXISTS idx_cases_target_status ON moderation_cases(target_type, target_id, status);
  `);

  const sessionColumns = db.prepare('PRAGMA table_info(sessions)').all().map((column) => column.name);
  if (!sessionColumns.includes('expires_at')) {
    db.exec('ALTER TABLE sessions ADD COLUMN expires_at INTEGER NOT NULL DEFAULT 0');
    db.prepare('UPDATE sessions SET expires_at = ? WHERE expires_at = 0').run(Date.now() + config.sessionTtlMs);
  }
}

export function createStore(options = {}) {
  const databasePath = options.databasePath || config.databasePath;
  ensureDatabaseDirectory(databasePath);
  const db = new DatabaseSync(databasePath);
  migrate(db);

  const users = new Map();
  const sessions = new Map();
  const magicTokens = new Map();
  const nicknames = new Map();
  const spaces = new Map();
  const posts = new Map();
  const comments = new Map();
  const reports = new Map();
  const moderationCases = new Map();
  const auditLog = [];

  function addAuditEvent(event) {
    auditLog.push(event);
    db.prepare(`
      INSERT INTO audit_log (id, operation, actor_hash, target_hash, target_type, target_id, reason, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      event.id,
      event.operation,
      event.actor_hash,
      event.target_hash || null,
      event.target_type || null,
      event.target_id || null,
      event.reason,
      event.created_at
    );
  }

  function persistUser(user) {
    db.prepare(`
      INSERT INTO users (user_hash, nickname, domain_group, trust_level, roles, created_at, banned)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_hash) DO UPDATE SET
        nickname = excluded.nickname,
        domain_group = excluded.domain_group,
        trust_level = excluded.trust_level,
        roles = excluded.roles,
        banned = excluded.banned
    `).run(
      user.user_hash,
      user.nickname,
      user.domain_group,
      user.trust_level,
      JSON.stringify(user.roles),
      user.created_at,
      boolToDb(user.banned)
    );
  }

  function load() {
    for (const row of db.prepare('SELECT * FROM users ORDER BY created_at').all()) {
      const user = rowToUser(row);
      users.set(user.user_hash, user);
      if (user.nickname) {
        nicknames.set(user.nickname.toLowerCase(), user.user_hash);
      }
    }

    for (const row of db.prepare('SELECT * FROM sessions ORDER BY created_at').all()) {
      const expiresAt = row.expires_at || Date.now() + config.sessionTtlMs;
      sessions.set(row.token, {
        user_hash: row.user_hash,
        created_at: row.created_at,
        expires_at: expiresAt
      });

      if (!row.expires_at) {
        db.prepare('UPDATE sessions SET expires_at = ? WHERE token = ?').run(expiresAt, row.token);
      }
    }

    for (const row of db.prepare('SELECT * FROM magic_tokens').all()) {
      magicTokens.set(row.token, {
        email: row.email,
        domain_group: row.domain_group,
        expires_at: row.expires_at
      });
    }

    for (const row of db.prepare('SELECT * FROM spaces ORDER BY created_at').all()) {
      const space = rowToSpace(row);
      spaces.set(space.id, space);
    }

    if (!spaces.has('public')) {
      const publicSpace = {
        id: 'public',
        name: 'Public',
        allowed_domains: [],
        created_at: new Date().toISOString()
      };
      spaces.set(publicSpace.id, publicSpace);
      db.prepare('INSERT INTO spaces (id, name, allowed_domains, created_at) VALUES (?, ?, ?, ?)')
        .run(publicSpace.id, publicSpace.name, JSON.stringify(publicSpace.allowed_domains), publicSpace.created_at);
    }

    for (const row of db.prepare('SELECT * FROM posts ORDER BY created_at').all()) {
      const post = rowToPost(row);
      posts.set(post.id, post);
    }

    for (const row of db.prepare('SELECT * FROM comments ORDER BY created_at').all()) {
      const comment = rowToComment(row);
      comments.set(comment.id, comment);
    }

    for (const row of db.prepare('SELECT * FROM reports ORDER BY created_at').all()) {
      const report = rowToReport(row);
      reports.set(report.id, report);
    }

    for (const row of db.prepare('SELECT * FROM moderation_cases ORDER BY created_at').all()) {
      const moderationCase = rowToModerationCase(row);
      moderationCases.set(moderationCase.id, moderationCase);
    }

    for (const row of db.prepare('SELECT * FROM audit_log ORDER BY created_at').all()) {
      auditLog.push(rowToAuditEvent(row));
    }
  }

  load();

  return {
    db,
    users,
    sessions,
    magicTokens,
    nicknames,
    spaces,
    posts,
    comments,
    reports,
    moderationCases,
    auditLog,

    close() {
      db.close();
    },

    persistUser,

    createMagicToken(email, domainGroup, ttlMs) {
      const token = nanoid(32);
      const record = {
        email,
        domain_group: domainGroup,
        expires_at: Date.now() + ttlMs
      };
      magicTokens.set(token, record);
      db.prepare('INSERT INTO magic_tokens (token, email, domain_group, expires_at) VALUES (?, ?, ?, ?)')
        .run(token, record.email, record.domain_group, record.expires_at);
      return token;
    },

    consumeMagicToken(token) {
      const record = magicTokens.get(token);
      if (!record) {
        return null;
      }

      magicTokens.delete(token);
      db.prepare('DELETE FROM magic_tokens WHERE token = ?').run(token);
      if (record.expires_at < Date.now()) {
        return null;
      }

      return record;
    },

    upsertUser(userHash, domainGroup) {
      const existing = users.get(userHash);
      if (existing) {
        return existing;
      }

      const user = {
        user_hash: userHash,
        nickname: null,
        domain_group: domainGroup,
        trust_level: 0,
        roles: [],
        created_at: new Date().toISOString(),
        banned: false
      };
      users.set(userHash, user);
      persistUser(user);
      return user;
    },

    createSession(userHash) {
      const token = nanoid(40);
      const session = {
        user_hash: userHash,
        created_at: new Date().toISOString(),
        expires_at: Date.now() + config.sessionTtlMs
      };
      sessions.set(token, session);
      db.prepare('INSERT INTO sessions (token, user_hash, created_at, expires_at) VALUES (?, ?, ?, ?)')
        .run(token, session.user_hash, session.created_at, session.expires_at);
      return token;
    },

    findSession(token) {
      const session = sessions.get(token);
      if (!session) {
        return null;
      }

      if (session.expires_at <= Date.now()) {
        sessions.delete(token);
        db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
        return null;
      }

      return users.get(session.user_hash) || null;
    },

    setNickname(userHash, nickname) {
      const canonical = nickname.toLowerCase();
      if (nicknames.has(canonical)) {
        return false;
      }

      const user = users.get(userHash);
      if (!user || user.nickname) {
        return false;
      }

      user.nickname = nickname;
      nicknames.set(canonical, userHash);
      persistUser(user);
      return true;
    },

    createSpace(name, allowedDomains) {
      const space = {
        id: nanoid(12),
        name,
        allowed_domains: allowedDomains,
        created_at: new Date().toISOString()
      };
      spaces.set(space.id, space);
      db.prepare('INSERT INTO spaces (id, name, allowed_domains, created_at) VALUES (?, ?, ?, ?)')
        .run(space.id, space.name, JSON.stringify(space.allowed_domains), space.created_at);
      return space;
    },

    createPost(userHash, spaceId, content) {
      const post = {
        id: nanoid(16),
        user_hash: userHash,
        space_id: spaceId,
        content,
        created_at: new Date().toISOString(),
        hidden: false
      };
      posts.set(post.id, post);
      db.prepare(`
        INSERT INTO posts (id, user_hash, space_id, content, created_at, hidden)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(post.id, post.user_hash, post.space_id, post.content, post.created_at, boolToDb(post.hidden));
      return post;
    },

    createComment(postId, userHash, content) {
      const comment = {
        id: nanoid(16),
        post_id: postId,
        user_hash: userHash,
        content,
        created_at: new Date().toISOString(),
        hidden: false
      };
      comments.set(comment.id, comment);
      db.prepare(`
        INSERT INTO comments (id, post_id, user_hash, content, created_at, hidden)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(comment.id, comment.post_id, comment.user_hash, comment.content, comment.created_at, boolToDb(comment.hidden));
      return comment;
    },

    createReport(actorHash, targetType, targetId, reason, weight) {
      const existing = [...reports.values()].find((report) => {
        return report.actor_hash === actorHash
          && report.target_type === targetType
          && report.target_id === targetId;
      });

      if (existing) {
        return { report: existing, duplicate: true };
      }

      const report = {
        id: nanoid(16),
        actor_hash: actorHash,
        target_type: targetType,
        target_id: targetId,
        reason,
        weight,
        created_at: new Date().toISOString()
      };
      reports.set(report.id, report);
      db.prepare(`
        INSERT INTO reports (id, actor_hash, target_type, target_id, reason, weight, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        report.id,
        report.actor_hash,
        report.target_type,
        report.target_id,
        report.reason,
        report.weight,
        report.created_at
      );
      return { report, duplicate: false };
    },

    findOpenCase(targetType, targetId) {
      return [...moderationCases.values()].find((moderationCase) => {
        return moderationCase.target_type === targetType
          && moderationCase.target_id === targetId
          && moderationCase.status === 'open';
      }) || null;
    },

    createModerationCase(targetType, targetId, accusedHash, reportIds) {
      const moderationCase = {
        id: nanoid(16),
        target_type: targetType,
        target_id: targetId,
        accused_hash: accusedHash,
        report_ids: reportIds,
        status: 'open',
        votes: [],
        created_at: new Date().toISOString(),
        resolved_at: null,
        resolution: null
      };
      moderationCases.set(moderationCase.id, moderationCase);
      db.prepare(`
        INSERT INTO moderation_cases (
          id, target_type, target_id, accused_hash, report_ids, status, votes, created_at, resolved_at, resolution
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        moderationCase.id,
        moderationCase.target_type,
        moderationCase.target_id,
        moderationCase.accused_hash,
        JSON.stringify(moderationCase.report_ids),
        moderationCase.status,
        JSON.stringify(moderationCase.votes),
        moderationCase.created_at,
        moderationCase.resolved_at,
        moderationCase.resolution
      );
      addAuditEvent({
        id: nanoid(16),
        operation: 'case_opened',
        actor_hash: 'system',
        target_hash: accusedHash,
        target_type: targetType,
        target_id: targetId,
        reason: 'report threshold reached',
        created_at: new Date().toISOString()
      });
      return moderationCase;
    },

    addCaseVote(caseId, voterHash, decision, action, weight) {
      const moderationCase = moderationCases.get(caseId);
      if (!moderationCase || moderationCase.status !== 'open') {
        return null;
      }

      if (moderationCase.votes.some((vote) => vote.voter_hash === voterHash)) {
        return { moderationCase, duplicate: true };
      }

      moderationCase.votes.push({
        voter_hash: voterHash,
        decision,
        action,
        weight,
        created_at: new Date().toISOString()
      });
      db.prepare('UPDATE moderation_cases SET votes = ? WHERE id = ?')
        .run(JSON.stringify(moderationCase.votes), moderationCase.id);
      return { moderationCase, duplicate: false };
    },

    resolveCase(caseId, resolution) {
      const moderationCase = moderationCases.get(caseId);
      if (!moderationCase || moderationCase.status !== 'open') {
        return null;
      }

      moderationCase.status = 'resolved';
      moderationCase.resolved_at = new Date().toISOString();
      moderationCase.resolution = resolution;
      db.prepare('UPDATE moderation_cases SET status = ?, resolved_at = ?, resolution = ? WHERE id = ?')
        .run(
          moderationCase.status,
          moderationCase.resolved_at,
          JSON.stringify(moderationCase.resolution),
          moderationCase.id
        );
      addAuditEvent({
        id: nanoid(16),
        operation: 'jury_decision',
        actor_hash: 'jury',
        target_hash: moderationCase.accused_hash,
        target_type: moderationCase.target_type,
        target_id: moderationCase.target_id,
        reason: resolution.reason,
        created_at: moderationCase.resolved_at
      });
      return moderationCase;
    },

    hideTarget(targetType, targetId) {
      if (targetType === 'post') {
        const post = posts.get(targetId);
        if (!post) {
          return false;
        }
        post.hidden = true;
        db.prepare('UPDATE posts SET hidden = 1 WHERE id = ?').run(targetId);
        return true;
      }

      if (targetType === 'comment') {
        const comment = comments.get(targetId);
        if (!comment) {
          return false;
        }
        comment.hidden = true;
        db.prepare('UPDATE comments SET hidden = 1 WHERE id = ?').run(targetId);
        return true;
      }

      return false;
    },

    banUser(actorHash, targetHash, reason) {
      const target = users.get(targetHash);
      if (!target) {
        return false;
      }

      target.banned = true;
      persistUser(target);
      addAuditEvent({
        id: nanoid(16),
        operation: 'ban',
        actor_hash: actorHash,
        target_hash: targetHash,
        reason,
        created_at: new Date().toISOString()
      });
      return true;
    }
  };
}
