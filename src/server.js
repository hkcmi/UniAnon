import express from 'express';
import helmet from 'helmet';
import { config } from './config.js';
import {
  createEmailDigest,
  createScopedNullifier,
  createUserHash,
  getDomain,
  isAllowedDomain,
  normalizeEmail,
  publicUser
} from './identity.js';
import { createMailer } from './mailer.js';
import { createMembershipAssertion, verifyMembershipAssertion } from './membership-assertion.js';
import { createRateLimiter } from './rate-limit.js';
import { createStore } from './store.js';

export const store = createStore();
export const rateLimiter = createRateLimiter();
export const mailer = createMailer();
export const app = express();

app.use(helmet());
app.use(express.json({ limit: '64kb' }));
app.use(express.static('public'));

function requireAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
  const user = token ? store.findSession(token) : null;

  if (!user) {
    return res.status(401).json({ error: 'authentication_required' });
  }

  if (user.banned) {
    return res.status(403).json({ error: 'user_banned' });
  }

  req.user = user;
  return next();
}

function optionalAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
  const user = token ? store.findSession(token) : null;
  req.user = user && !user.banned ? user : null;
  return next();
}

function requireNickname(req, res, next) {
  if (!req.user.nickname) {
    return res.status(409).json({ error: 'nickname_required' });
  }
  return next();
}

function requireModerator(req, res, next) {
  if (!req.user.roles.includes('moderator') && !req.user.roles.includes('system_admin')) {
    return res.status(403).json({ error: 'moderator_required' });
  }
  return next();
}

function requireTrustedJuror(req, res, next) {
  if (req.user.trust_level < 2) {
    return res.status(403).json({ error: 'trusted_juror_required' });
  }
  return next();
}

function trustWeight(user) {
  return Math.min(user.trust_level + 1, 4);
}

async function enforceRateLimit(req, res, limitName, subject) {
  const result = await rateLimiter.consume(limitName, subject);
  res.set('X-RateLimit-Limit', String(result.max));
  res.set('X-RateLimit-Remaining', String(result.remaining));

  if (result.allowed) {
    return true;
  }

  res.set('Retry-After', String(result.retry_after));
  res.status(429).json({
    error: 'rate_limited',
    limit: limitName,
    retry_after: result.retry_after
  });
  return false;
}

function serializePost(post) {
  const user = store.users.get(post.user_hash);
  const postComments = [...store.comments.values()]
    .filter((comment) => comment.post_id === post.id && !comment.hidden)
    .map((comment) => {
      const commentUser = store.users.get(comment.user_hash);
      return {
        id: comment.id,
        post_id: comment.post_id,
        nickname: commentUser?.nickname || '[deleted]',
        content: comment.content,
        created_at: comment.created_at
      };
    });

  return {
    id: post.id,
    space_id: post.space_id,
    nickname: user?.nickname || '[deleted]',
    content: post.content,
    created_at: post.created_at,
    comments: postComments
  };
}

function serializeSpace(space) {
  return {
    id: space.id,
    name: space.name,
    allowed_domains: space.allowed_domains,
    created_at: space.created_at
  };
}

function serializeCase(moderationCase) {
  const reports = moderationCase.report_ids.map((reportId) => store.reports.get(reportId)).filter(Boolean);
  const violationWeight = moderationCase.votes
    .filter((vote) => vote.decision === 'violation')
    .reduce((sum, vote) => sum + vote.weight, 0);
  const dismissWeight = moderationCase.votes
    .filter((vote) => vote.decision === 'dismiss')
    .reduce((sum, vote) => sum + vote.weight, 0);

  return {
    id: moderationCase.id,
    target_type: moderationCase.target_type,
    target_id: moderationCase.target_id,
    accused_hash: moderationCase.accused_hash,
    status: moderationCase.status,
    report_count: reports.length,
    report_weight: reports.reduce((sum, report) => sum + report.weight, 0),
    violation_weight: violationWeight,
    dismiss_weight: dismissWeight,
    created_at: moderationCase.created_at,
    resolved_at: moderationCase.resolved_at,
    resolution: moderationCase.resolution
  };
}

function validateContent(content) {
  if (typeof content !== 'string') {
    return null;
  }

  const trimmed = content.trim();
  if (trimmed.length < 1 || trimmed.length > 5000) {
    return null;
  }

  return trimmed;
}

function validateSpaceName(name) {
  if (typeof name !== 'string') {
    return null;
  }

  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 80) {
    return null;
  }

  return trimmed;
}

function canAccessSpace(user, space) {
  if (!space) {
    return false;
  }

  if (space.allowed_domains.length === 0) {
    return true;
  }

  return Boolean(user && space.allowed_domains.includes(user.domain_group));
}

function findReportTarget(targetType, targetId) {
  if (targetType === 'post') {
    const post = store.posts.get(targetId);
    return post && !post.hidden ? { exists: true, accusedHash: post.user_hash } : null;
  }

  if (targetType === 'comment') {
    const comment = store.comments.get(targetId);
    return comment && !comment.hidden ? { exists: true, accusedHash: comment.user_hash } : null;
  }

  if (targetType === 'user') {
    const user = store.users.get(targetId);
    return user ? { exists: true, accusedHash: user.user_hash } : null;
  }

  return null;
}

function caseApprovalThreshold(moderationCase) {
  const accused = store.users.get(moderationCase.accused_hash);
  const protectedRole = accused?.roles.includes('moderator') || accused?.roles.includes('system_admin');
  return protectedRole ? config.adminProtectionApprovalWeight : config.juryApprovalWeight;
}

function maybeResolveCase(moderationCase) {
  const violationVotes = moderationCase.votes.filter((vote) => vote.decision === 'violation');
  const dismissWeight = moderationCase.votes
    .filter((vote) => vote.decision === 'dismiss')
    .reduce((sum, vote) => sum + vote.weight, 0);
  const violationWeight = violationVotes.reduce((sum, vote) => sum + vote.weight, 0);
  const approvalThreshold = caseApprovalThreshold(moderationCase);

  if (dismissWeight >= config.juryApprovalWeight) {
    return store.resolveCase(moderationCase.id, {
      decision: 'dismiss',
      action: 'none',
      reason: 'jury dismissed the case'
    });
  }

  if (violationWeight < approvalThreshold) {
    return moderationCase;
  }

  const preferredAction = violationVotes.at(-1)?.action || 'hide_content';
  if (preferredAction === 'ban_user') {
    store.banUser('jury', moderationCase.accused_hash, 'jury approved ban');
  } else if (moderationCase.target_type !== 'user') {
    store.hideTarget(moderationCase.target_type, moderationCase.target_id);
  }

  return store.resolveCase(moderationCase.id, {
    decision: 'violation',
    action: preferredAction,
    reason: `jury approved ${preferredAction}`
  });
}

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    allowed_domains: config.allowedDomains
  });
});

app.post('/auth/request-link', async (req, res) => {
  const email = normalizeEmail(req.body.email);
  if (!email) {
    store.logAuthEvent({
      eventType: 'magic_link_requested',
      success: false,
      reason: 'invalid_email'
    });
    return res.status(400).json({ error: 'invalid_email' });
  }

  const domainGroup = getDomain(email);
  const emailDigest = createEmailDigest(email, config.authLogSecret);
  if (!isAllowedDomain(email, config.allowedDomains)) {
    store.logAuthEvent({
      eventType: 'magic_link_requested',
      emailDigest,
      domainGroup,
      success: false,
      reason: 'domain_not_allowed'
    });
    return res.status(403).json({ error: 'domain_not_allowed' });
  }

  const subjectHash = createUserHash(email, config.authSubjectSecret);
  const nullifier = createScopedNullifier(subjectHash, config.communityId, config.nullifierSecret);
  const emailAllowed = await enforceRateLimit(req, res, 'magicLinkEmail', subjectHash);
  if (!emailAllowed) {
    store.logAuthEvent({
      eventType: 'magic_link_requested',
      emailDigest,
      domainGroup,
      success: false,
      reason: 'email_rate_limited'
    });
    return;
  }

  const ipAllowed = await enforceRateLimit(req, res, 'magicLinkIp', req.ip);
  if (!ipAllowed) {
    store.logAuthEvent({
      eventType: 'magic_link_requested',
      emailDigest,
      domainGroup,
      success: false,
      reason: 'ip_rate_limited'
    });
    return;
  }

  const token = store.createMagicToken(subjectHash, domainGroup, config.tokenTtlMs, nullifier);
  const deliveryResult = await mailer.sendMagicLink(email, token);
  store.logAuthEvent({
    eventType: 'magic_link_requested',
    emailDigest,
    domainGroup,
    success: true,
    reason: 'sent'
  });
  return res.status(201).json({
    ok: true,
    ...deliveryResult
  });
});

app.post('/auth/verify', (req, res) => {
  const record = store.consumeMagicToken(req.body.token);
  if (!record) {
    return res.status(400).json({ error: 'invalid_or_expired_token' });
  }

  const membershipAssertion = createMembershipAssertion({
    subjectHash: record.subject_hash,
    domainGroup: record.domain_group,
    nullifier: record.nullifier
  });
  const user = store.upsertUser(record.subject_hash, record.domain_group, record.nullifier);
  if (user.banned) {
    return res.status(403).json({ error: 'user_banned' });
  }
  const sessionToken = store.createSession(user.user_hash);

  return res.json({
    session_token: sessionToken,
    membership_assertion: membershipAssertion,
    expires_in: Math.floor(config.sessionTtlMs / 1000),
    user: publicUser(user),
    nickname_required: !user.nickname
  });
});

app.post('/auth/exchange', (req, res) => {
  const assertion = verifyMembershipAssertion(req.body.membership_assertion);
  if (!assertion) {
    return res.status(400).json({ error: 'invalid_or_expired_assertion' });
  }

  const user = store.upsertUser(assertion.sub, assertion.domain_group, assertion.nullifier);
  if (user.banned) {
    return res.status(403).json({ error: 'user_banned' });
  }
  const sessionToken = store.createSession(user.user_hash);

  return res.json({
    session_token: sessionToken,
    expires_in: Math.floor(config.sessionTtlMs / 1000),
    user: publicUser(user),
    nickname_required: !user.nickname
  });
});

app.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

app.get('/spaces', optionalAuth, (req, res) => {
  const spaces = [...store.spaces.values()]
    .filter((space) => canAccessSpace(req.user, space))
    .map(serializeSpace);

  res.json({ spaces });
});

app.post('/spaces', requireAuth, requireModerator, (req, res) => {
  const name = validateSpaceName(req.body.name);
  const allowedDomains = Array.isArray(req.body.allowed_domains)
    ? req.body.allowed_domains.map((domain) => String(domain).trim().toLowerCase()).filter(Boolean)
    : [];

  if (!name) {
    return res.status(400).json({ error: 'invalid_space_name' });
  }

  const unknownDomain = allowedDomains.find((domain) => !config.allowedDomains.includes(domain));
  if (unknownDomain) {
    return res.status(400).json({ error: 'domain_not_allowed', domain: unknownDomain });
  }

  const space = store.createSpace(name, [...new Set(allowedDomains)]);
  return res.status(201).json({ space: serializeSpace(space) });
});

app.post('/users/nickname', requireAuth, (req, res) => {
  const nickname = typeof req.body.nickname === 'string' ? req.body.nickname.trim() : '';
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,31}$/.test(nickname)) {
    return res.status(400).json({ error: 'invalid_nickname' });
  }

  const ok = store.setNickname(req.user.user_hash, nickname);
  if (!ok) {
    return res.status(409).json({ error: 'nickname_unavailable_or_already_set' });
  }

  return res.status(201).json({ user: publicUser(req.user) });
});

app.post('/posts', requireAuth, requireNickname, async (req, res) => {
  const content = validateContent(req.body.content);
  if (!content) {
    return res.status(400).json({ error: 'invalid_content' });
  }

  const allowed = await enforceRateLimit(req, res, 'postCreate', req.user.user_hash);
  if (!allowed) {
    return;
  }

  const spaceId = typeof req.body.space_id === 'string' ? req.body.space_id : 'public';
  const space = store.spaces.get(spaceId);
  if (!canAccessSpace(req.user, space)) {
    return res.status(403).json({ error: 'space_access_denied' });
  }

  const post = store.createPost(req.user.user_hash, space.id, content);
  return res.status(201).json({ post: serializePost(post) });
});

app.get('/posts', optionalAuth, (req, res) => {
  const requestedSpaceId = typeof req.query.space_id === 'string' ? req.query.space_id : null;
  const visiblePosts = [...store.posts.values()]
    .filter((post) => !post.hidden)
    .filter((post) => !requestedSpaceId || post.space_id === requestedSpaceId)
    .filter((post) => canAccessSpace(req.user, store.spaces.get(post.space_id)))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map(serializePost);

  res.json({ posts: visiblePosts });
});

app.post('/posts/:postId/comments', requireAuth, requireNickname, async (req, res) => {
  const post = store.posts.get(req.params.postId);
  if (!post || post.hidden) {
    return res.status(404).json({ error: 'post_not_found' });
  }

  const content = validateContent(req.body.content);
  if (!content) {
    return res.status(400).json({ error: 'invalid_content' });
  }

  const allowed = await enforceRateLimit(req, res, 'commentCreate', req.user.user_hash);
  if (!allowed) {
    return;
  }

  const comment = store.createComment(post.id, req.user.user_hash, content);
  return res.status(201).json({
    comment: {
      id: comment.id,
      post_id: comment.post_id,
      nickname: req.user.nickname,
      content: comment.content,
      created_at: comment.created_at
    }
  });
});

app.post('/reports', requireAuth, requireNickname, async (req, res) => {
  const targetType = req.body.target_type;
  const targetId = typeof req.body.target_id === 'string' ? req.body.target_id : '';
  const reason = validateContent(req.body.reason) || 'No reason provided';

  if (!['post', 'comment', 'user'].includes(targetType)) {
    return res.status(400).json({ error: 'invalid_target_type' });
  }

  const target = findReportTarget(targetType, targetId);
  if (!target) {
    return res.status(404).json({ error: 'target_not_found' });
  }

  if (target.accusedHash === req.user.user_hash) {
    return res.status(400).json({ error: 'cannot_report_self' });
  }

  const allowed = await enforceRateLimit(req, res, 'reportCreate', req.user.user_hash);
  if (!allowed) {
    return;
  }

  const { report, duplicate } = store.createReport(
    req.user.user_hash,
    targetType,
    targetId,
    reason,
    trustWeight(req.user)
  );

  if (duplicate) {
    return res.status(409).json({ error: 'duplicate_report', report_id: report.id });
  }

  let moderationCase = store.findOpenCase(targetType, targetId);
  const targetReports = [...store.reports.values()].filter((candidate) => {
    return candidate.target_type === targetType && candidate.target_id === targetId;
  });
  const reportWeight = targetReports.reduce((sum, candidate) => sum + candidate.weight, 0);

  if (!moderationCase && reportWeight >= config.reportWeightThreshold) {
    moderationCase = store.createModerationCase(
      targetType,
      targetId,
      target.accusedHash,
      targetReports.map((candidate) => candidate.id)
    );
  }

  return res.status(201).json({
    report_id: report.id,
    report_weight: reportWeight,
    case: moderationCase ? serializeCase(moderationCase) : null
  });
});

app.get('/governance/cases', requireAuth, requireTrustedJuror, (req, res) => {
  const cases = [...store.moderationCases.values()]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map(serializeCase);

  res.json({ cases });
});

app.post('/governance/cases/:caseId/votes', requireAuth, requireTrustedJuror, async (req, res) => {
  const decision = req.body.decision;
  const action = req.body.action || 'hide_content';

  if (!['violation', 'dismiss'].includes(decision)) {
    return res.status(400).json({ error: 'invalid_decision' });
  }

  if (!['hide_content', 'ban_user', 'none'].includes(action)) {
    return res.status(400).json({ error: 'invalid_action' });
  }

  const moderationCase = store.moderationCases.get(req.params.caseId);
  if (!moderationCase) {
    return res.status(404).json({ error: 'case_not_found' });
  }

  if (moderationCase.accused_hash === req.user.user_hash) {
    return res.status(400).json({ error: 'cannot_vote_on_own_case' });
  }

  const allowed = await enforceRateLimit(req, res, 'juryVote', req.user.user_hash);
  if (!allowed) {
    return;
  }

  const result = store.addCaseVote(
    moderationCase.id,
    req.user.user_hash,
    decision,
    action,
    trustWeight(req.user)
  );

  if (!result) {
    return res.status(409).json({ error: 'case_not_open' });
  }

  if (result.duplicate) {
    return res.status(409).json({ error: 'duplicate_vote' });
  }

  const resolvedCase = maybeResolveCase(result.moderationCase);
  return res.status(201).json({ case: serializeCase(resolvedCase) });
});

app.post('/moderation/ban', requireAuth, requireModerator, (req, res) => {
  const targetHash = typeof req.body.user_hash === 'string' ? req.body.user_hash : '';
  const reason = validateContent(req.body.reason) || 'No reason provided';
  const ok = store.banUser(req.user.user_hash, targetHash, reason);

  if (!ok) {
    return res.status(404).json({ error: 'target_not_found' });
  }

  return res.status(201).json({ ok: true });
});

app.get('/moderation/audit-log', requireAuth, requireModerator, (req, res) => {
  res.json({ audit_log: store.auditLog });
});

app.use((req, res) => {
  res.status(404).json({ error: 'not_found' });
});

if (process.argv[1] === new URL(import.meta.url).pathname) {
  app.listen(config.port, () => {
    console.log(`UniAnon API listening on http://localhost:${config.port}`);
  });
}
