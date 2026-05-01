import { nanoid } from 'nanoid';

export function createStore() {
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

  spaces.set('public', {
    id: 'public',
    name: 'Public',
    allowed_domains: [],
    created_at: new Date().toISOString()
  });

  return {
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

    createMagicToken(email, domainGroup, ttlMs) {
      const token = nanoid(32);
      magicTokens.set(token, {
        email,
        domain_group: domainGroup,
        expires_at: Date.now() + ttlMs
      });
      return token;
    },

    consumeMagicToken(token) {
      const record = magicTokens.get(token);
      if (!record) {
        return null;
      }

      magicTokens.delete(token);
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
      return user;
    },

    createSession(userHash) {
      const token = nanoid(40);
      sessions.set(token, {
        user_hash: userHash,
        created_at: new Date().toISOString()
      });
      return token;
    },

    findSession(token) {
      const session = sessions.get(token);
      if (!session) {
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
      auditLog.push({
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
      auditLog.push({
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
        return true;
      }

      if (targetType === 'comment') {
        const comment = comments.get(targetId);
        if (!comment) {
          return false;
        }
        comment.hidden = true;
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
      auditLog.push({
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
