import express from 'express';
import helmet from 'helmet';
import crypto from 'node:crypto';
import { assertProductionConfig, config } from './config.js';
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
import { createAuthorizationRequest, fetchDiscovery } from './oidc.js';
import { createRateLimiter } from './rate-limit.js';
import { createStore } from './store.js';

export const store = createStore();
export const rateLimiter = createRateLimiter();
export const mailer = createMailer();
export const app = express();

app.use(helmet());
app.use(express.json({ limit: '64kb' }));
app.use(express.static('public'));

const errorMessages = {
  appeal_not_found: 'Appeal not found.',
  appeal_not_open: 'This appeal is no longer open.',
  appealable_target_not_found: 'That item is not currently appealable.',
  authentication_required: 'Sign in to continue.',
  cannot_appeal_other_user_target: 'You can only appeal actions against your own account or content.',
  cannot_ban_self: 'Moderators cannot ban themselves.',
  cannot_report_self: 'You cannot report your own account or content.',
  cannot_vote_on_own_appeal: 'You cannot vote on your own appeal.',
  cannot_vote_on_own_case: 'You cannot vote on your own case.',
  case_not_found: 'Case not found.',
  case_not_open: 'This case is no longer open.',
  domain_not_allowed: 'This email domain is not allowed on this UniAnon instance.',
  duplicate_appeal: 'An open appeal already exists for this target.',
  duplicate_report: 'You have already reported this target.',
  duplicate_vote: 'You have already voted.',
  invalid_action: 'Choose a supported moderation action.',
  invalid_content: 'Content must be non-empty, under 5000 characters, and free of control characters or repeated-character noise.',
  invalid_decision: 'Choose a supported decision.',
  invalid_email: 'Enter a valid email address.',
  invalid_nickname: 'Nicknames must be 3-32 safe characters and cannot use reserved or URL-like names.',
  invalid_or_expired_assertion: 'This membership proof is invalid or expired.',
  invalid_or_expired_token: 'This magic link token is invalid or expired.',
  invalid_reason: 'Enter a reason for this appeal.',
  invalid_space_name: 'Space names must be 2-80 characters.',
  invalid_target_type: 'Choose a supported target type.',
  juror_not_assigned: 'This case is assigned to a different jury.',
  moderator_required: 'Moderator access is required.',
  nickname_required: 'Set a nickname before continuing.',
  nickname_unavailable_or_already_set: 'That nickname is unavailable or has already been set.',
  not_found: 'Not found.',
  oidc_not_configured: 'OIDC is not configured for this UniAnon instance.',
  oidc_provider_unavailable: 'OIDC provider metadata could not be loaded.',
  own_approval_not_sufficient: 'A second moderator or administrator must approve this action.',
  post_not_found: 'Post not found.',
  protected_user_requires_governance: 'Protected users can only be sanctioned through governance.',
  rate_limited: 'Too many requests. Please wait and try again.',
  space_access_denied: 'You do not have access to this space.',
  target_already_banned: 'That user is already banned.',
  target_not_found: 'Target not found.',
  trusted_juror_required: 'Trusted-user access is required.',
  user_banned: 'This account is banned. You may open an appeal if eligible.'
};

app.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body && typeof body === 'object' && body.error && !body.message) {
      return originalJson({
        ...body,
        message: errorMessages[body.error] || 'Request failed.'
      });
    }
    return originalJson(body);
  };
  next();
});

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

function hasProtectedRole(user) {
  return Boolean(user?.roles.includes('moderator') || user?.roles.includes('system_admin'));
}

function voteWeight(user) {
  return Math.min(user.trust_level + 1, 4);
}

function reportWeight(user) {
  if (user.banned || !user.nickname) {
    return 0;
  }

  if (user.trust_level <= 0) {
    return 1;
  }

  return Math.min(3, user.trust_level + 1);
}

function reportThresholdForTarget(accusedHash) {
  const accused = store.users.get(accusedHash);
  return hasProtectedRole(accused) ? config.adminProtectionApprovalWeight : config.reportWeightThreshold;
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

function serializeApprovalRequest(request) {
  return {
    id: request.id,
    operation: request.operation,
    status: request.status,
    approvals_count: request.approvals.length,
    required_approvals: config.highImpactApprovalCount,
    created_by: request.created_by,
    created_at: request.created_at,
    resolved_at: request.resolved_at,
    result: request.result
  };
}

function publicAuditRef(value) {
  if (!value) {
    return null;
  }

  return crypto
    .createHmac('sha256', config.serverSecret)
    .update(`audit:${value}`)
    .digest('hex')
    .slice(0, 12);
}

function serializePublicAuditEvent(event) {
  return {
    id: event.id,
    operation: event.operation,
    actor_ref: publicAuditRef(event.actor_hash),
    target_ref: publicAuditRef(event.target_hash || event.target_id),
    target_type: event.target_type || null,
    reason: event.reason,
    created_at: event.created_at
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
    juror_count: moderationCase.juror_hashes?.length || 0,
    violation_weight: violationWeight,
    dismiss_weight: dismissWeight,
    created_at: moderationCase.created_at,
    resolved_at: moderationCase.resolved_at,
    resolution: moderationCase.resolution
  };
}

function serializeAppealCase(appealCase) {
  const approveWeight = appealCase.votes
    .filter((vote) => vote.decision === 'approve')
    .reduce((sum, vote) => sum + vote.weight, 0);
  const dismissWeight = appealCase.votes
    .filter((vote) => vote.decision === 'dismiss')
    .reduce((sum, vote) => sum + vote.weight, 0);

  return {
    id: appealCase.id,
    appellant_hash: appealCase.appellant_hash,
    target_type: appealCase.target_type,
    target_id: appealCase.target_id,
    status: appealCase.status,
    approve_weight: approveWeight,
    dismiss_weight: dismissWeight,
    created_at: appealCase.created_at,
    resolved_at: appealCase.resolved_at,
    resolution: appealCase.resolution
  };
}

function validateContent(content) {
  if (typeof content !== 'string') {
    return null;
  }

  const trimmed = content.trim().replace(/\r\n/g, '\n');
  if (trimmed.length < 1 || trimmed.length > 5000) {
    return null;
  }

  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(trimmed)) {
    return null;
  }

  if (/(.)\1{79,}/u.test(trimmed)) {
    return null;
  }

  const nonWhitespace = trimmed.replace(/\s/g, '');
  if (nonWhitespace.length < 1) {
    return null;
  }

  return trimmed;
}

function validateNickname(nickname) {
  if (typeof nickname !== 'string') {
    return null;
  }

  const trimmed = nickname.trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,31}$/.test(trimmed)) {
    return null;
  }

  const canonical = trimmed.toLowerCase();
  const reserved = new Set([
    'admin',
    'administrator',
    'appeal_jury',
    'deleted',
    'jury',
    'moderator',
    'system',
    'system_admin',
    'unianon'
  ]);

  if (reserved.has(canonical)) {
    return null;
  }

  if (canonical.includes('http') || canonical.includes('www') || canonical.includes('dotcom')) {
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

function findAppealTarget(targetType, targetId) {
  if (targetType === 'user') {
    const user = store.users.get(targetId);
    return user && user.banned ? { ownerHash: user.user_hash, punished: true } : null;
  }

  if (targetType === 'post') {
    const post = store.posts.get(targetId);
    return post && post.hidden ? { ownerHash: post.user_hash, punished: true } : null;
  }

  if (targetType === 'comment') {
    const comment = store.comments.get(targetId);
    return comment && comment.hidden ? { ownerHash: comment.user_hash, punished: true } : null;
  }

  return null;
}

function findBearerUser(req) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
  return token ? store.findSession(token) : null;
}

function authenticateAppealActor(req) {
  const sessionUser = findBearerUser(req);
  if (sessionUser) {
    return sessionUser;
  }

  const assertion = verifyMembershipAssertion(req.body.membership_assertion);
  if (!assertion) {
    return null;
  }

  return store.upsertUser(assertion.sub, assertion.domain_group, assertion.nullifier);
}

function caseApprovalThreshold(moderationCase) {
  const accused = store.users.get(moderationCase.accused_hash);
  return hasProtectedRole(accused) ? config.adminProtectionApprovalWeight : config.juryApprovalWeight;
}

function maybeResolveAppealCase(appealCase) {
  const approveWeight = appealCase.votes
    .filter((vote) => vote.decision === 'approve')
    .reduce((sum, vote) => sum + vote.weight, 0);
  const dismissWeight = appealCase.votes
    .filter((vote) => vote.decision === 'dismiss')
    .reduce((sum, vote) => sum + vote.weight, 0);

  if (dismissWeight >= config.juryApprovalWeight) {
    return store.resolveAppealCase(appealCase.id, {
      decision: 'dismiss',
      action: 'none',
      reason: 'appeal jury dismissed the appeal'
    });
  }

  if (approveWeight < config.juryApprovalWeight) {
    return appealCase;
  }

  if (appealCase.target_type === 'user') {
    store.unbanUser('appeal_jury', appealCase.target_id, 'appeal approved restore access');
  } else {
    store.unhideTarget(appealCase.target_type, appealCase.target_id);
  }

  return store.resolveAppealCase(appealCase.id, {
    decision: 'approve',
    action: appealCase.target_type === 'user' ? 'restore_access' : 'restore_content',
    reason: 'appeal jury approved the appeal'
  });
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
    return res.status(403).json({
      error: 'user_banned',
      membership_assertion: membershipAssertion,
      user: publicUser(user)
    });
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

app.get('/auth/oidc/start', async (req, res) => {
  if (!config.oidc.issuer || !config.oidc.clientId || !config.oidc.redirectUri) {
    return res.status(501).json({ error: 'oidc_not_configured' });
  }

  const discovery = await fetchDiscovery(config.oidc.issuer);
  if (!discovery) {
    return res.status(502).json({ error: 'oidc_provider_unavailable' });
  }

  const authorizationRequest = createAuthorizationRequest({
    discovery,
    clientId: config.oidc.clientId,
    redirectUri: config.oidc.redirectUri,
    scopes: config.oidc.scopes
  });

  return res.json({
    ...authorizationRequest,
    issuer: discovery.issuer
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

  const payload = {
    name,
    allowed_domains: [...new Set(allowedDomains)].sort()
  };
  const existing = store.findOpenApprovalRequest('create_space', payload);
  const approvalRequest = existing || store.createApprovalRequest('create_space', payload, req.user.user_hash);

  if (existing && existing.created_by === req.user.user_hash && !existing.approvals.some((hash) => hash !== req.user.user_hash)) {
    return res.status(409).json({
      error: 'own_approval_not_sufficient',
      approval_request: serializeApprovalRequest(existing)
    });
  }

  if (existing) {
    store.approveRequest(existing.id, req.user.user_hash);
  }

  if (approvalRequest.approvals.length < config.highImpactApprovalCount) {
    return res.status(202).json({ approval_request: serializeApprovalRequest(approvalRequest) });
  }

  const space = store.createSpace(payload.name, payload.allowed_domains);
  store.resolveApprovalRequest(approvalRequest.id, { space_id: space.id });
  return res.status(201).json({
    space: serializeSpace(space),
    approval_request: serializeApprovalRequest(approvalRequest)
  });
});

app.get('/approvals', requireAuth, requireModerator, (req, res) => {
  const approvals = [...store.approvalRequests.values()]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map(serializeApprovalRequest);
  res.json({ approvals });
});

app.post('/users/nickname', requireAuth, (req, res) => {
  const nickname = validateNickname(req.body.nickname);
  if (!nickname) {
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
    reportWeight(req.user)
  );

  if (duplicate) {
    return res.status(409).json({ error: 'duplicate_report', report_id: report.id });
  }

  let moderationCase = store.findOpenCase(targetType, targetId);
  const targetReports = [...store.reports.values()].filter((candidate) => {
    return candidate.target_type === targetType && candidate.target_id === targetId;
  });
  const totalReportWeight = targetReports.reduce((sum, candidate) => sum + candidate.weight, 0);
  const reportThreshold = reportThresholdForTarget(target.accusedHash);

  if (!moderationCase && totalReportWeight >= reportThreshold) {
    moderationCase = store.createModerationCase(
      targetType,
      targetId,
      target.accusedHash,
      targetReports.map((candidate) => candidate.id)
    );
  }

  return res.status(201).json({
    report_id: report.id,
    report_weight: totalReportWeight,
    report_threshold: reportThreshold,
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

  if (moderationCase.juror_hashes.length > 0 && !moderationCase.juror_hashes.includes(req.user.user_hash)) {
    return res.status(403).json({ error: 'juror_not_assigned' });
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
    voteWeight(req.user)
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

app.post('/appeals', (req, res) => {
  const appellant = authenticateAppealActor(req);
  if (!appellant) {
    return res.status(401).json({ error: 'authentication_required' });
  }

  const targetType = req.body.target_type;
  const targetId = typeof req.body.target_id === 'string' ? req.body.target_id : '';
  const reason = validateContent(req.body.reason);

  if (!['user', 'post', 'comment'].includes(targetType)) {
    return res.status(400).json({ error: 'invalid_target_type' });
  }

  if (!reason) {
    return res.status(400).json({ error: 'invalid_reason' });
  }

  const target = findAppealTarget(targetType, targetId);
  if (!target) {
    return res.status(404).json({ error: 'appealable_target_not_found' });
  }

  if (target.ownerHash !== appellant.user_hash) {
    return res.status(403).json({ error: 'cannot_appeal_other_user_target' });
  }

  const existing = store.findOpenAppealCase(appellant.user_hash, targetType, targetId);
  if (existing) {
    return res.status(409).json({ error: 'duplicate_appeal', appeal_id: existing.id });
  }

  const appealCase = store.createAppealCase(appellant.user_hash, targetType, targetId, reason);
  return res.status(201).json({ appeal: serializeAppealCase(appealCase) });
});

app.get('/appeals', requireAuth, requireTrustedJuror, (req, res) => {
  const appeals = [...store.appealCases.values()]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map(serializeAppealCase);

  res.json({ appeals });
});

app.post('/appeals/:appealId/votes', requireAuth, requireTrustedJuror, async (req, res) => {
  const decision = req.body.decision;

  if (!['approve', 'dismiss'].includes(decision)) {
    return res.status(400).json({ error: 'invalid_decision' });
  }

  const appealCase = store.appealCases.get(req.params.appealId);
  if (!appealCase) {
    return res.status(404).json({ error: 'appeal_not_found' });
  }

  if (appealCase.appellant_hash === req.user.user_hash) {
    return res.status(400).json({ error: 'cannot_vote_on_own_appeal' });
  }

  const allowed = await enforceRateLimit(req, res, 'juryVote', req.user.user_hash);
  if (!allowed) {
    return;
  }

  const result = store.addAppealVote(
    appealCase.id,
    req.user.user_hash,
    decision,
    voteWeight(req.user)
  );

  if (!result) {
    return res.status(409).json({ error: 'appeal_not_open' });
  }

  if (result.duplicate) {
    return res.status(409).json({ error: 'duplicate_vote' });
  }

  const resolvedAppeal = maybeResolveAppealCase(result.appealCase);
  return res.status(201).json({ appeal: serializeAppealCase(resolvedAppeal) });
});

app.post('/moderation/ban', requireAuth, requireModerator, (req, res) => {
  const targetHash = typeof req.body.user_hash === 'string' ? req.body.user_hash : '';
  const reason = validateContent(req.body.reason) || 'No reason provided';
  const target = store.users.get(targetHash);

  if (!target) {
    return res.status(404).json({ error: 'target_not_found' });
  }

  if (target.user_hash === req.user.user_hash) {
    return res.status(400).json({ error: 'cannot_ban_self' });
  }

  if (target.banned) {
    return res.status(409).json({ error: 'target_already_banned' });
  }

  if (hasProtectedRole(target)) {
    return res.status(403).json({
      error: 'protected_user_requires_governance',
      required_approval_weight: config.adminProtectionApprovalWeight
    });
  }

  const ok = store.banUser(req.user.user_hash, targetHash, reason);

  if (!ok) {
    return res.status(404).json({ error: 'target_not_found' });
  }

  return res.status(201).json({ ok: true });
});

app.get('/moderation/audit-log', requireAuth, requireModerator, (req, res) => {
  res.json({ audit_log: store.auditLog });
});

app.get('/audit-log', (req, res) => {
  const auditLog = store.auditLog
    .map(serializePublicAuditEvent)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  res.json({ audit_log: auditLog });
});

app.use((req, res) => {
  res.status(404).json({ error: 'not_found' });
});

if (process.argv[1] === new URL(import.meta.url).pathname) {
  assertProductionConfig();
  app.listen(config.port, () => {
    console.log(`UniAnon API listening on http://localhost:${config.port}`);
  });
}
