import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
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

function hashSessionToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function rowToUser(row) {
  return {
    user_hash: row.user_hash,
    nullifier: row.nullifier || row.user_hash,
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

function rowToAuthEvent(row) {
  return {
    id: row.id,
    event_type: row.event_type,
    email_digest: row.email_digest,
    domain_group: row.domain_group,
    success: boolFromDb(row.success),
    reason: row.reason,
    created_at: row.created_at
  };
}

function rowToAppealCase(row) {
  return {
    id: row.id,
    appellant_hash: row.appellant_hash,
    target_type: row.target_type,
    target_id: row.target_id,
    reason: row.reason,
    status: row.status,
    votes: parseJson(row.votes, []),
    created_at: row.created_at,
    resolved_at: row.resolved_at,
    resolution: parseJson(row.resolution, null)
  };
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      user_hash TEXT PRIMARY KEY,
      nullifier TEXT UNIQUE,
      nickname TEXT UNIQUE,
      domain_group TEXT NOT NULL,
      trust_level INTEGER NOT NULL DEFAULT 0,
      roles TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      banned INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT,
      token_hash TEXT UNIQUE,
      user_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS magic_tokens (
      token TEXT PRIMARY KEY,
      subject_hash TEXT,
      nullifier TEXT,
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

    CREATE TABLE IF NOT EXISTS auth_events (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      email_digest TEXT,
      domain_group TEXT,
      success INTEGER NOT NULL DEFAULT 0,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS appeal_cases (
      id TEXT PRIMARY KEY,
      appellant_hash TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL,
      votes TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      resolved_at TEXT,
      resolution TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_posts_space_id ON posts(space_id);
    CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id);
    CREATE INDEX IF NOT EXISTS idx_reports_target ON reports(target_type, target_id);
    CREATE INDEX IF NOT EXISTS idx_cases_target_status ON moderation_cases(target_type, target_id, status);
    CREATE INDEX IF NOT EXISTS idx_auth_events_email_digest ON auth_events(email_digest);
    CREATE INDEX IF NOT EXISTS idx_appeal_cases_target_status ON appeal_cases(target_type, target_id, status);
  `);

  const sessionColumns = db.prepare('PRAGMA table_info(sessions)').all().map((column) => column.name);
  if (!sessionColumns.includes('token_hash')) {
    db.exec('ALTER TABLE sessions ADD COLUMN token_hash TEXT');
  }

  if (!sessionColumns.includes('expires_at')) {
    db.exec('ALTER TABLE sessions ADD COLUMN expires_at INTEGER NOT NULL DEFAULT 0');
    db.prepare('UPDATE sessions SET expires_at = ? WHERE expires_at = 0').run(Date.now() + config.sessionTtlMs);
  }

  for (const row of db.prepare('SELECT rowid, token, token_hash FROM sessions').all()) {
    if (!row.token_hash && row.token) {
      db.prepare('UPDATE sessions SET token_hash = ?, token = NULL WHERE rowid = ?')
        .run(hashSessionToken(row.token), row.rowid);
    }
  }

  db.prepare('DELETE FROM sessions WHERE token_hash IS NULL OR token_hash = ?').run('');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash)');

  const userColumns = db.prepare('PRAGMA table_info(users)').all().map((column) => column.name);
  if (!userColumns.includes('nullifier')) {
    db.exec('ALTER TABLE users ADD COLUMN nullifier TEXT');
    db.prepare('UPDATE users SET nullifier = user_hash WHERE nullifier IS NULL OR nullifier = ?').run('');
  }
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_nullifier ON users(nullifier)');

  const magicTokenColumns = db.prepare('PRAGMA table_info(magic_tokens)').all().map((column) => column.name);
  if (!magicTokenColumns.includes('subject_hash') || !magicTokenColumns.includes('nullifier') || magicTokenColumns.includes('email')) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS magic_tokens_v2 (
        token TEXT PRIMARY KEY,
        subject_hash TEXT NOT NULL,
        nullifier TEXT NOT NULL,
        domain_group TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
    `);

    if (magicTokenColumns.includes('subject_hash') && magicTokenColumns.includes('nullifier')) {
      db.exec(`
        INSERT OR IGNORE INTO magic_tokens_v2 (token, subject_hash, nullifier, domain_group, expires_at)
        SELECT token, subject_hash, nullifier, domain_group, expires_at FROM magic_tokens
        WHERE subject_hash IS NOT NULL AND nullifier IS NOT NULL;
      `);
    }

    db.exec('DROP TABLE magic_tokens');
    db.exec('ALTER TABLE magic_tokens_v2 RENAME TO magic_tokens');
  }
}

export function createStore(options = {}) {
  const databasePath = options.databasePath || config.databasePath;
  ensureDatabaseDirectory(databasePath);
  const db = new DatabaseSync(databasePath);
  migrate(db);

  const users = new Map();
  const nullifiers = new Map();
  const sessions = new Map();
  const magicTokens = new Map();
  const nicknames = new Map();
  const spaces = new Map();
  const posts = new Map();
  const comments = new Map();
  const reports = new Map();
  const moderationCases = new Map();
  const appealCases = new Map();
  const auditLog = [];
  const authEvents = [];

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

  function addAuthEvent(event) {
    authEvents.push(event);
    db.prepare(`
      INSERT INTO auth_events (id, event_type, email_digest, domain_group, success, reason, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      event.id,
      event.event_type,
      event.email_digest || null,
      event.domain_group || null,
      boolToDb(event.success),
      event.reason,
      event.created_at
    );
  }

  function persistUser(user) {
    db.prepare(`
      INSERT INTO users (user_hash, nullifier, nickname, domain_group, trust_level, roles, created_at, banned)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_hash) DO UPDATE SET
        nullifier = excluded.nullifier,
        nickname = excluded.nickname,
        domain_group = excluded.domain_group,
        trust_level = excluded.trust_level,
        roles = excluded.roles,
        banned = excluded.banned
    `).run(
      user.user_hash,
      user.nullifier,
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
      nullifiers.set(user.nullifier, user.user_hash);
      if (user.nickname) {
        nicknames.set(user.nickname.toLowerCase(), user.user_hash);
      }
    }

    for (const row of db.prepare('SELECT * FROM sessions ORDER BY created_at').all()) {
      const expiresAt = row.expires_at || Date.now() + config.sessionTtlMs;
      sessions.set(row.token_hash, {
        user_hash: row.user_hash,
        created_at: row.created_at,
        expires_at: expiresAt
      });

      if (!row.expires_at) {
        db.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?').run(expiresAt, row.token_hash);
      }
    }

    for (const row of db.prepare('SELECT * FROM magic_tokens').all()) {
      magicTokens.set(row.token, {
        subject_hash: row.subject_hash,
        nullifier: row.nullifier,
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

    for (const row of db.prepare('SELECT * FROM appeal_cases ORDER BY created_at').all()) {
      const appealCase = rowToAppealCase(row);
      appealCases.set(appealCase.id, appealCase);
    }

    for (const row of db.prepare('SELECT * FROM audit_log ORDER BY created_at').all()) {
      auditLog.push(rowToAuditEvent(row));
    }

    for (const row of db.prepare('SELECT * FROM auth_events ORDER BY created_at').all()) {
      authEvents.push(rowToAuthEvent(row));
    }
  }

  load();

  return {
    db,
    users,
    nullifiers,
    sessions,
    magicTokens,
    nicknames,
    spaces,
    posts,
    comments,
    reports,
    moderationCases,
    appealCases,
    auditLog,
    authEvents,

    close() {
      db.close();
    },

    persistUser,

    logAuthEvent({ eventType, emailDigest, domainGroup = null, success, reason }) {
      const event = {
        id: nanoid(16),
        event_type: eventType,
        email_digest: emailDigest,
        domain_group: domainGroup,
        success,
        reason,
        created_at: new Date().toISOString()
      };
      addAuthEvent(event);
      return event;
    },

    createMagicToken(subjectHash, domainGroup, ttlMs, nullifier = subjectHash) {
      const token = nanoid(32);
      const record = {
        subject_hash: subjectHash,
        nullifier,
        domain_group: domainGroup,
        expires_at: Date.now() + ttlMs
      };
      magicTokens.set(token, record);
      db.prepare('INSERT INTO magic_tokens (token, subject_hash, nullifier, domain_group, expires_at) VALUES (?, ?, ?, ?, ?)')
        .run(token, record.subject_hash, record.nullifier, record.domain_group, record.expires_at);
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

    upsertUser(userHash, domainGroup, nullifier = userHash) {
      const existing = users.get(userHash);
      if (existing) {
        if (!existing.nullifier) {
          existing.nullifier = nullifier;
          nullifiers.set(nullifier, existing.user_hash);
          persistUser(existing);
        }
        return existing;
      }

      const existingHash = nullifiers.get(nullifier);
      if (existingHash) {
        return users.get(existingHash);
      }

      const user = {
        user_hash: userHash,
        nullifier,
        nickname: null,
        domain_group: domainGroup,
        trust_level: 0,
        roles: [],
        created_at: new Date().toISOString(),
        banned: false
      };
      users.set(userHash, user);
      nullifiers.set(nullifier, userHash);
      persistUser(user);
      return user;
    },

    createSession(userHash) {
      const token = nanoid(40);
      const tokenHash = hashSessionToken(token);
      const session = {
        user_hash: userHash,
        created_at: new Date().toISOString(),
        expires_at: Date.now() + config.sessionTtlMs
      };
      sessions.set(tokenHash, session);
      db.prepare('INSERT INTO sessions (token, token_hash, user_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
        .run(null, tokenHash, session.user_hash, session.created_at, session.expires_at);
      return token;
    },

    findSession(token) {
      const tokenHash = hashSessionToken(token);
      const session = sessions.get(tokenHash);
      if (!session) {
        return null;
      }

      if (session.expires_at <= Date.now()) {
        sessions.delete(tokenHash);
        db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
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

    findOpenAppealCase(appellantHash, targetType, targetId) {
      return [...appealCases.values()].find((appealCase) => {
        return appealCase.appellant_hash === appellantHash
          && appealCase.target_type === targetType
          && appealCase.target_id === targetId
          && appealCase.status === 'open';
      }) || null;
    },

    createAppealCase(appellantHash, targetType, targetId, reason) {
      const appealCase = {
        id: nanoid(16),
        appellant_hash: appellantHash,
        target_type: targetType,
        target_id: targetId,
        reason,
        status: 'open',
        votes: [],
        created_at: new Date().toISOString(),
        resolved_at: null,
        resolution: null
      };
      appealCases.set(appealCase.id, appealCase);
      db.prepare(`
        INSERT INTO appeal_cases (
          id, appellant_hash, target_type, target_id, reason, status, votes, created_at, resolved_at, resolution
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        appealCase.id,
        appealCase.appellant_hash,
        appealCase.target_type,
        appealCase.target_id,
        appealCase.reason,
        appealCase.status,
        JSON.stringify(appealCase.votes),
        appealCase.created_at,
        appealCase.resolved_at,
        appealCase.resolution
      );
      addAuditEvent({
        id: nanoid(16),
        operation: 'appeal_opened',
        actor_hash: appellantHash,
        target_hash: targetType === 'user' ? targetId : null,
        target_type: targetType,
        target_id: targetId,
        reason,
        created_at: new Date().toISOString()
      });
      return appealCase;
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

    addAppealVote(caseId, voterHash, decision, weight) {
      const appealCase = appealCases.get(caseId);
      if (!appealCase || appealCase.status !== 'open') {
        return null;
      }

      if (appealCase.votes.some((vote) => vote.voter_hash === voterHash)) {
        return { appealCase, duplicate: true };
      }

      appealCase.votes.push({
        voter_hash: voterHash,
        decision,
        weight,
        created_at: new Date().toISOString()
      });
      db.prepare('UPDATE appeal_cases SET votes = ? WHERE id = ?')
        .run(JSON.stringify(appealCase.votes), appealCase.id);
      return { appealCase, duplicate: false };
    },

    resolveAppealCase(caseId, resolution) {
      const appealCase = appealCases.get(caseId);
      if (!appealCase || appealCase.status !== 'open') {
        return null;
      }

      appealCase.status = 'resolved';
      appealCase.resolved_at = new Date().toISOString();
      appealCase.resolution = resolution;
      db.prepare('UPDATE appeal_cases SET status = ?, resolved_at = ?, resolution = ? WHERE id = ?')
        .run(
          appealCase.status,
          appealCase.resolved_at,
          JSON.stringify(appealCase.resolution),
          appealCase.id
        );
      addAuditEvent({
        id: nanoid(16),
        operation: 'appeal_decision',
        actor_hash: 'appeal_jury',
        target_hash: appealCase.target_type === 'user' ? appealCase.target_id : appealCase.appellant_hash,
        target_type: appealCase.target_type,
        target_id: appealCase.target_id,
        reason: resolution.reason,
        created_at: appealCase.resolved_at
      });
      return appealCase;
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

    unhideTarget(targetType, targetId) {
      if (targetType === 'post') {
        const post = posts.get(targetId);
        if (!post) {
          return false;
        }
        post.hidden = false;
        db.prepare('UPDATE posts SET hidden = 0 WHERE id = ?').run(targetId);
        return true;
      }

      if (targetType === 'comment') {
        const comment = comments.get(targetId);
        if (!comment) {
          return false;
        }
        comment.hidden = false;
        db.prepare('UPDATE comments SET hidden = 0 WHERE id = ?').run(targetId);
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
    },

    unbanUser(actorHash, targetHash, reason) {
      const target = users.get(targetHash);
      if (!target) {
        return false;
      }

      target.banned = false;
      persistUser(target);
      addAuditEvent({
        id: nanoid(16),
        operation: 'unban',
        actor_hash: actorHash,
        target_hash: targetHash,
        reason,
        created_at: new Date().toISOString()
      });
      return true;
    }
  };
}
