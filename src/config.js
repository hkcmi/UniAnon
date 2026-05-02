import 'dotenv/config';

const defaultDomains = ['example.edu', 'example.org', 'company.com'];
const isTest = process.env.NODE_ENV === 'test';
const defaultSecret = 'dev-only-change-me';

export const config = {
  port: Number(process.env.PORT || 3000),
  databasePath: process.env.DATABASE_PATH || (process.env.NODE_ENV === 'test' ? ':memory:' : 'data/unianon.sqlite'),
  serverSecret: process.env.SERVER_SECRET || defaultSecret,
  authSubjectSecret: process.env.AUTH_SUBJECT_SECRET || process.env.SERVER_SECRET || defaultSecret,
  authLogSecret: process.env.AUTH_LOG_SECRET || process.env.SERVER_SECRET || defaultSecret,
  nullifierSecret: process.env.NULLIFIER_SECRET || process.env.SERVER_SECRET || defaultSecret,
  communityId: process.env.COMMUNITY_ID || 'unianon-local',
  membershipAssertionSecret: process.env.MEMBERSHIP_ASSERTION_SECRET || process.env.SERVER_SECRET || defaultSecret,
  membershipAssertionTtlMs: Number(process.env.MEMBERSHIP_ASSERTION_TTL_MS || 5 * 60 * 1000),
  sessionTtlMs: Number(process.env.SESSION_TTL_MS || 7 * 24 * 60 * 60 * 1000),
  allowedDomains: (process.env.ALLOWED_DOMAINS || defaultDomains.join(','))
    .split(',')
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean),
  tokenTtlMs: Number(process.env.MAGIC_TOKEN_TTL_MS || 15 * 60 * 1000),
  appBaseUrl: process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`,
  emailDelivery: process.env.EMAIL_DELIVERY || 'dev',
  emailFrom: process.env.EMAIL_FROM || 'UniAnon <no-reply@localhost>',
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || ''
  },
  oidc: {
    issuer: process.env.OIDC_ISSUER || '',
    clientId: process.env.OIDC_CLIENT_ID || '',
    redirectUri: process.env.OIDC_REDIRECT_URI || '',
    scopes: (process.env.OIDC_SCOPES || 'openid')
      .split(',')
      .map((scope) => scope.trim())
      .filter(Boolean)
  },
  reportWeightThreshold: Number(process.env.REPORT_WEIGHT_THRESHOLD || 3),
  juryApprovalWeight: Number(process.env.JURY_APPROVAL_WEIGHT || 3),
  jurySize: Number(process.env.JURY_SIZE || 5),
  adminProtectionApprovalWeight: Number(process.env.ADMIN_PROTECTION_APPROVAL_WEIGHT || 8),
  highImpactApprovalCount: Number(process.env.HIGH_IMPACT_APPROVAL_COUNT || 2),
  redisUrl: process.env.REDIS_URL || '',
  rateLimits: {
    magicLinkEmail: {
      windowMs: Number(process.env.RATE_LIMIT_MAGIC_LINK_EMAIL_WINDOW_MS || 60 * 1000),
      max: Number(process.env.RATE_LIMIT_MAGIC_LINK_EMAIL_MAX || 3)
    },
    magicLinkIp: {
      windowMs: Number(process.env.RATE_LIMIT_MAGIC_LINK_IP_WINDOW_MS || 60 * 1000),
      max: Number(process.env.RATE_LIMIT_MAGIC_LINK_IP_MAX || (isTest ? 1000 : 10))
    },
    postCreate: {
      windowMs: Number(process.env.RATE_LIMIT_POST_CREATE_WINDOW_MS || 60 * 1000),
      max: Number(process.env.RATE_LIMIT_POST_CREATE_MAX || 5)
    },
    commentCreate: {
      windowMs: Number(process.env.RATE_LIMIT_COMMENT_CREATE_WINDOW_MS || 10 * 1000),
      max: Number(process.env.RATE_LIMIT_COMMENT_CREATE_MAX || 3)
    },
    reportCreate: {
      windowMs: Number(process.env.RATE_LIMIT_REPORT_CREATE_WINDOW_MS || 60 * 60 * 1000),
      max: Number(process.env.RATE_LIMIT_REPORT_CREATE_MAX || 10)
    },
    juryVote: {
      windowMs: Number(process.env.RATE_LIMIT_JURY_VOTE_WINDOW_MS || 60 * 1000),
      max: Number(process.env.RATE_LIMIT_JURY_VOTE_MAX || 10)
    }
  }
};

export function validateProductionConfig(currentConfig = config, env = process.env.NODE_ENV) {
  if (env !== 'production') {
    return [];
  }

  const issues = [];
  const secretEntries = [
    ['SERVER_SECRET', currentConfig.serverSecret],
    ['AUTH_SUBJECT_SECRET', currentConfig.authSubjectSecret],
    ['AUTH_LOG_SECRET', currentConfig.authLogSecret],
    ['NULLIFIER_SECRET', currentConfig.nullifierSecret],
    ['MEMBERSHIP_ASSERTION_SECRET', currentConfig.membershipAssertionSecret]
  ];

  for (const [name, value] of secretEntries) {
    if (!value || value === defaultSecret || value.length < 32) {
      issues.push(`${name} must be set to a unique secret with at least 32 characters.`);
    }
  }

  if (new Set(secretEntries.map(([, value]) => value)).size !== secretEntries.length) {
    issues.push('Production secrets must be distinct from each other.');
  }

  if (!currentConfig.allowedDomains.length) {
    issues.push('ALLOWED_DOMAINS must contain at least one domain.');
  }

  if (currentConfig.emailDelivery === 'dev') {
    issues.push('EMAIL_DELIVERY=dev is not allowed in production.');
  }

  if (currentConfig.appBaseUrl.includes('localhost')) {
    issues.push('APP_BASE_URL must not use localhost in production.');
  }

  return issues;
}

export function assertProductionConfig(currentConfig = config, env = process.env.NODE_ENV) {
  const issues = validateProductionConfig(currentConfig, env);
  if (issues.length > 0) {
    throw new Error(`Invalid production configuration:\n- ${issues.join('\n- ')}`);
  }
}
