import express from 'express';
import helmet from 'helmet';
import { createAuditService } from './audit-service.js';
import { createApprovalService } from './approval-service.js';
import { createAuthService } from './auth-service.js';
import { assertProductionConfig, config } from './config.js';
import { createContentService } from './content-service.js';
import { createContentViewService } from './content-view-service.js';
import { createGovernanceCaseService } from './governance-case-service.js';
import { createGovernanceResolutionService } from './governance-resolution-service.js';
import { createGovernanceViewService } from './governance-view-service.js';
import {
  createEmailDigest,
  createScopedNullifier,
  createUserHash,
  getDomain,
  isAllowedDomain,
  normalizeEmail,
  publicUser
} from './identity.js';
import { verifyMembershipAssertion } from './membership-assertion.js';
import { buildMetricsSummary } from './metrics-service.js';
import { createModerationActionService } from './moderation-action-service.js';
import { createModerationTargetService } from './moderation-target-service.js';
import {
  createAuthorizationRequest,
  exchangeAuthorizationCode,
  extractVerifiedDomainFromClaims,
  fetchDiscovery,
  fetchJwks,
  verifyIdToken
} from './oidc.js';
import { createReportService } from './report-service.js';
import { createRoleService, normalizeRoleChange } from './role-service.js';
import { createServices } from './services.js';
import { createSpaceService, normalizeSpaceRequest } from './space-service.js';
import { createProfileService, validateNickname } from './profile-service.js';

const services = createServices();
export const { store, rateLimiter, mailer, oidcStateStore, sessionService } = services;
export const authService = createAuthService({
  store,
  sessionService,
  sessionTtlMs: config.sessionTtlMs
});
export const contentService = createContentService(store);
export const contentViews = createContentViewService(store);
export const auditService = createAuditService(store);
export const governanceCases = createGovernanceCaseService(store);
export const governanceResolutions = createGovernanceResolutionService(store, {
  juryApprovalWeight: config.juryApprovalWeight,
  adminProtectionApprovalWeight: config.adminProtectionApprovalWeight
});
export const governanceViews = createGovernanceViewService(store, {
  approvalThresholdForCase: (moderationCase) => governanceResolutions.caseApprovalThreshold(moderationCase)
});
export const moderationTargets = createModerationTargetService(store);
export const reportService = createReportService(store, {
  thresholdForAccused: (accusedHash) => reportThresholdForTarget(accusedHash)
});
export const approvalService = createApprovalService(store, {
  requiredApprovals: config.highImpactApprovalCount
});
export const roleService = createRoleService(store);
export const spaceService = createSpaceService(store);
export const profileService = createProfileService(store);
export const moderationActions = createModerationActionService(store, {
  protectedUserApprovalWeight: config.adminProtectionApprovalWeight
});
export const app = express();

if (config.trustProxy) {
  app.set('trust proxy', config.trustProxy);
}
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
  email_delivery_disabled: 'Email magic-link login is disabled for this UniAnon instance.',
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
  oidc_invalid_callback: 'OIDC sign-in could not be verified.',
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

function sendOidcCallbackError(req, res, status, error) {
  const message = errorMessages[error] || errorMessages.oidc_invalid_callback;
  if (wantsHtml(req)) {
    return res.status(status).type('html').send(renderOidcCallbackFailure(message));
  }
  return res.status(status).json({ error });
}

function storeOidcState(state, nonce) {
  oidcStateStore.save(state, nonce);
}

function consumeOidcState(state) {
  return oidcStateStore.consume(state);
}

function wantsHtml(req) {
  return String(req.get('accept') || '').includes('text/html');
}

function escapeHtmlAttribute(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function renderOidcCallbackHandoff(payload) {
  const sessionToken = escapeHtmlAttribute(payload.session_token);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>UniAnon OIDC Sign-In</title>
    <link rel="stylesheet" href="/styles.css">
  </head>
  <body>
    <header class="topbar">
      <div>
        <h1>UniAnon</h1>
        <p>Completing sign-in</p>
      </div>
    </header>
    <main class="shell">
      <section class="panel auth-panel">
        <div class="panel-head">
          <h2>Access</h2>
          <span class="badge">OIDC verified</span>
        </div>
        <p class="status">Redirecting...</p>
        <div id="oidcHandoff" data-session-token="${sessionToken}"></div>
        <noscript>
          <p class="status">JavaScript is required to complete browser sign-in.</p>
          <a href="/">Return to UniAnon</a>
        </noscript>
      </section>
    </main>
    <script src="/oidc-handoff.js" defer></script>
  </body>
</html>`;
}

function renderOidcCallbackFailure(message) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>UniAnon OIDC Sign-In</title>
    <link rel="stylesheet" href="/styles.css">
  </head>
  <body>
    <header class="topbar">
      <div>
        <h1>UniAnon</h1>
        <p>Sign-in failed</p>
      </div>
    </header>
    <main class="shell">
      <section class="panel auth-panel">
        <div class="panel-head">
          <h2>Access</h2>
          <span class="badge">OIDC</span>
        </div>
        <p class="status">${message}</p>
        <a href="/">Return to UniAnon</a>
      </section>
    </main>
  </body>
</html>`;
}

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
  const user = sessionService.findUserByAuthorization(req.get('authorization'));

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
  req.user = sessionService.findActiveUserByAuthorization(req.get('authorization'));
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

function requireSystemAdmin(req, res, next) {
  if (!req.user.roles.includes('system_admin')) {
    return res.status(403).json({ error: 'system_admin_required' });
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

function findBearerUser(req) {
  return sessionService.findUserByAuthorization(req.get('authorization'));
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

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    allowed_domains: config.allowedDomains,
    email_login_enabled: config.emailDelivery !== 'disabled',
    oidc_enabled: Boolean(config.oidc.issuer && config.oidc.clientId && config.oidc.redirectUri)
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

  if (config.emailDelivery === 'disabled') {
    store.logAuthEvent({
      eventType: 'magic_link_requested',
      success: false,
      reason: 'email_delivery_disabled'
    });
    return res.status(501).json({ error: 'email_delivery_disabled' });
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
  const result = authService.verifyMagicToken(req.body.token);
  return res.status(result.status).json(result.payload);
});

app.post('/auth/exchange', (req, res) => {
  const result = authService.exchangeMembershipAssertion(req.body.membership_assertion);
  return res.status(result.status).json(result.payload);
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
  if (!authorizationRequest) {
    return res.status(502).json({ error: 'oidc_provider_unavailable' });
  }
  storeOidcState(authorizationRequest.state, authorizationRequest.nonce);

  return res.json({
    ...authorizationRequest,
    issuer: discovery.issuer
  });
});

app.get('/auth/oidc/callback', async (req, res) => {
  if (!config.oidc.issuer || !config.oidc.clientId || !config.oidc.redirectUri) {
    return sendOidcCallbackError(req, res, 501, 'oidc_not_configured');
  }

  const stateRecord = consumeOidcState(req.query.state);
  if (!stateRecord || typeof req.query.code !== 'string') {
    return sendOidcCallbackError(req, res, 400, 'oidc_invalid_callback');
  }

  const discovery = await fetchDiscovery(config.oidc.issuer);
  if (!discovery?.token_endpoint || !discovery?.jwks_uri) {
    return sendOidcCallbackError(req, res, 502, 'oidc_provider_unavailable');
  }

  const tokens = await exchangeAuthorizationCode({
    discovery,
    code: req.query.code,
    clientId: config.oidc.clientId,
    clientSecret: config.oidc.clientSecret,
    redirectUri: config.oidc.redirectUri
  });
  if (!tokens) {
    return sendOidcCallbackError(req, res, 400, 'oidc_invalid_callback');
  }

  const jwks = await fetchJwks(discovery.jwks_uri);
  const claims = verifyIdToken(tokens.id_token, {
    issuer: discovery.issuer,
    clientId: config.oidc.clientId,
    nonce: stateRecord.nonce,
    jwks
  });
  const domainGroup = extractVerifiedDomainFromClaims(claims, config.allowedDomains, config.oidc.domainClaimNames);
  if (!claims || !domainGroup) {
    return sendOidcCallbackError(req, res, 403, claims ? 'domain_not_allowed' : 'oidc_invalid_callback');
  }

  const subjectHash = createUserHash(`${claims.iss}:${claims.sub}`, config.authSubjectSecret);
  const nullifier = createScopedNullifier(subjectHash, config.communityId, config.nullifierSecret);
  const result = authService.loginWithMembership({
    subjectHash,
    domainGroup,
    nullifier
  }, {
    includeMembershipAssertion: true
  });
  if (!result.ok) {
    return res.status(result.status).json(result.payload);
  }

  if (wantsHtml(req)) {
    return res.type('html').send(renderOidcCallbackHandoff(result.payload));
  }

  return res.json(result.payload);
});

app.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

app.get('/spaces', optionalAuth, (req, res) => {
  res.json({ spaces: spaceService.listAccessibleSpaces(req.user) });
});

app.post('/spaces', requireAuth, requireModerator, (req, res) => {
  const normalized = normalizeSpaceRequest(req.body, config.allowedDomains);
  if (normalized.error) {
    const body = { error: normalized.error };
    if (normalized.domain) {
      body.domain = normalized.domain;
    }
    return res.status(400).json(body);
  }

  const { payload } = normalized;
  const approval = approvalService.requestOrApprove('create_space', payload, req.user.user_hash);
  if (!approval.ok) {
    return res.status(409).json({
      error: approval.error,
      approval_request: approvalService.serializeApprovalRequest(approval.approvalRequest)
    });
  }

  if (!approval.approved) {
    return res.status(202).json({ approval_request: approvalService.serializeApprovalRequest(approval.approvalRequest) });
  }

  const space = spaceService.createSpace(payload);
  return res.status(201).json({
    space,
    approval_request: approvalService.resolveApprovalRequest(approval.approvalRequest.id, { space_id: space.id })
  });
});

app.get('/approvals', requireAuth, requireModerator, (req, res) => {
  res.json({ approvals: approvalService.listApprovalRequests(req.user) });
});

app.get('/admin/users', requireAuth, requireSystemAdmin, (req, res) => {
  res.json({ users: roleService.listRoleTargets() });
});

app.get('/metrics/summary', requireAuth, requireModerator, (req, res) => {
  res.json({ metrics: buildMetricsSummary(store) });
});

app.post('/admin/roles', requireAuth, requireSystemAdmin, (req, res) => {
  const normalized = normalizeRoleChange(req.body);
  if (normalized.error) {
    return res.status(400).json({ error: normalized.error });
  }

  const { payload } = normalized;
  const target = roleService.getUser(payload.user_hash);
  const validation = roleService.validateRoleChange({ actor: req.user, target, payload });
  if (!validation.ok) {
    const body = { error: validation.error };
    if (validation.user) {
      body.user = validation.user;
    }
    return res.status(validation.status).json(body);
  }

  const approval = approvalService.requestOrApprove('change_role', payload, req.user.user_hash);
  if (!approval.ok) {
    return res.status(409).json({
      error: approval.error,
      approval_request: approvalService.serializeApprovalRequest(approval.approvalRequest)
    });
  }

  if (!approval.approved) {
    return res.status(202).json({ approval_request: approvalService.serializeApprovalRequest(approval.approvalRequest) });
  }

  const updatedUser = roleService.applyRoleChange({ actor: req.user, target, payload });

  return res.status(201).json({
    user: updatedUser,
    approval_request: approvalService.resolveApprovalRequest(
      approval.approvalRequest.id,
      { user_hash: target.user_hash, role: payload.role, action: payload.action }
    )
  });
});

app.post('/users/nickname', requireAuth, (req, res) => {
  const nickname = validateNickname(req.body.nickname);
  if (!nickname) {
    return res.status(400).json({ error: 'invalid_nickname' });
  }

  const result = profileService.setNickname(req.user, nickname);
  if (!result.ok) {
    return res.status(result.status).json({ error: result.error });
  }

  return res.status(201).json({ user: result.user });
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
  const result = contentService.createPost({
    user: req.user,
    spaceId,
    content
  });
  if (!result.ok) {
    return res.status(result.status).json({ error: result.error });
  }

  return res.status(201).json({ post: contentViews.serializePost(result.post) });
});

app.get('/posts', optionalAuth, (req, res) => {
  const requestedSpaceId = typeof req.query.space_id === 'string' ? req.query.space_id : null;
  const visiblePosts = contentService.listVisiblePosts({
    user: req.user,
    spaceId: requestedSpaceId
  })
    .map((post) => contentViews.serializePost(post));

  res.json({ posts: visiblePosts });
});

app.post('/posts/:postId/comments', requireAuth, requireNickname, async (req, res) => {
  const content = validateContent(req.body.content);
  if (!content) {
    return res.status(400).json({ error: 'invalid_content' });
  }

  const allowed = await enforceRateLimit(req, res, 'commentCreate', req.user.user_hash);
  if (!allowed) {
    return;
  }

  const result = contentService.createComment({
    user: req.user,
    postId: req.params.postId,
    content
  });
  if (!result.ok) {
    return res.status(result.status).json({ error: result.error });
  }

  const comment = result.comment;
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

  const target = moderationTargets.findReportTarget(targetType, targetId);
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

  const result = reportService.submitReport({
    actor: req.user,
    targetType,
    targetId,
    reason,
    accusedHash: target.accusedHash
  });
  if (!result.ok) {
    return res.status(result.status).json({ error: result.error, report_id: result.report.id });
  }

  return res.status(201).json({
    report_id: result.report.id,
    report_weight: result.reportSummary.reportWeight,
    report_threshold: result.reportSummary.reportThreshold,
    case: result.reportSummary.moderationCase ? governanceViews.serializeCase(result.reportSummary.moderationCase) : null
  });
});

app.get('/governance/cases', requireAuth, requireTrustedJuror, (req, res) => {
  const cases = governanceCases.listCases()
    .map((moderationCase) => governanceViews.serializeCase(moderationCase));

  res.json({ cases });
});

app.get('/governance/cases/:caseId', requireAuth, requireTrustedJuror, (req, res) => {
  const moderationCase = governanceCases.getCase(req.params.caseId);
  if (!moderationCase) {
    return res.status(404).json({ error: 'case_not_found' });
  }

  return res.json({ case: governanceViews.serializeCase(moderationCase) });
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

  const allowed = await enforceRateLimit(req, res, 'juryVote', req.user.user_hash);
  if (!allowed) {
    return;
  }

  const result = governanceCases.addCaseVote({
    caseId: req.params.caseId,
    user: req.user,
    decision,
    action,
    weight: voteWeight(req.user)
  });
  if (!result.ok) {
    return res.status(result.status).json({ error: result.error });
  }

  const resolvedCase = governanceResolutions.maybeResolveCase(result.moderationCase);
  return res.status(201).json({ case: governanceViews.serializeCase(resolvedCase) });
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

  const target = moderationTargets.findAppealTarget(targetType, targetId);
  if (!target) {
    return res.status(404).json({ error: 'appealable_target_not_found' });
  }

  if (target.ownerHash !== appellant.user_hash) {
    return res.status(403).json({ error: 'cannot_appeal_other_user_target' });
  }

  const appeal = governanceCases.createAppeal({
    appellant,
    targetType,
    targetId,
    reason
  });
  if (!appeal.ok) {
    return res.status(appeal.status).json({ error: appeal.error, appeal_id: appeal.appealId });
  }

  return res.status(201).json({ appeal: governanceViews.serializeAppealCase(appeal.appealCase) });
});

app.get('/appeals', requireAuth, requireTrustedJuror, (req, res) => {
  const appeals = governanceCases.listAppeals()
    .map((appealCase) => governanceViews.serializeAppealCase(appealCase));

  res.json({ appeals });
});

app.get('/appeals/:appealId', requireAuth, requireTrustedJuror, (req, res) => {
  const appealCase = governanceCases.getAppeal(req.params.appealId);
  if (!appealCase) {
    return res.status(404).json({ error: 'appeal_not_found' });
  }

  return res.json({ appeal: governanceViews.serializeAppealCase(appealCase) });
});

app.post('/appeals/:appealId/votes', requireAuth, requireTrustedJuror, async (req, res) => {
  const decision = req.body.decision;

  if (!['approve', 'dismiss'].includes(decision)) {
    return res.status(400).json({ error: 'invalid_decision' });
  }

  const allowed = await enforceRateLimit(req, res, 'juryVote', req.user.user_hash);
  if (!allowed) {
    return;
  }

  const result = governanceCases.addAppealVote({
    appealId: req.params.appealId,
    user: req.user,
    decision,
    weight: voteWeight(req.user)
  });
  if (!result.ok) {
    return res.status(result.status).json({ error: result.error });
  }

  const resolvedAppeal = governanceResolutions.maybeResolveAppealCase(result.appealCase);
  return res.status(201).json({ appeal: governanceViews.serializeAppealCase(resolvedAppeal) });
});

app.post('/moderation/ban', requireAuth, requireModerator, (req, res) => {
  const targetHash = typeof req.body.user_hash === 'string' ? req.body.user_hash : '';
  const reason = validateContent(req.body.reason) || 'No reason provided';
  const result = moderationActions.directBan({ actor: req.user, targetHash, reason });

  if (!result.ok) {
    const body = { error: result.error };
    if (result.required_approval_weight) {
      body.required_approval_weight = result.required_approval_weight;
    }
    return res.status(result.status).json(body);
  }

  return res.status(201).json({ ok: true });
});

app.get('/moderation/audit-log', requireAuth, requireModerator, (req, res) => {
  res.json({ audit_log: auditService.listModeratorAuditEvents() });
});

app.get('/audit-log', (req, res) => {
  res.json({ audit_log: auditService.listPublicAuditEvents() });
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
