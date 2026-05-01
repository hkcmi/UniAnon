import 'dotenv/config';

const defaultDomains = ['example.edu', 'example.org', 'company.com'];

export const config = {
  port: Number(process.env.PORT || 3000),
  databasePath: process.env.DATABASE_PATH || (process.env.NODE_ENV === 'test' ? ':memory:' : 'data/unianon.sqlite'),
  serverSecret: process.env.SERVER_SECRET || 'dev-only-change-me',
  sessionTtlMs: Number(process.env.SESSION_TTL_MS || 7 * 24 * 60 * 60 * 1000),
  allowedDomains: (process.env.ALLOWED_DOMAINS || defaultDomains.join(','))
    .split(',')
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean),
  tokenTtlMs: Number(process.env.MAGIC_TOKEN_TTL_MS || 15 * 60 * 1000),
  reportWeightThreshold: Number(process.env.REPORT_WEIGHT_THRESHOLD || 3),
  juryApprovalWeight: Number(process.env.JURY_APPROVAL_WEIGHT || 3),
  adminProtectionApprovalWeight: Number(process.env.ADMIN_PROTECTION_APPROVAL_WEIGHT || 8),
  redisUrl: process.env.REDIS_URL || '',
  rateLimits: {
    magicLinkEmail: {
      windowMs: Number(process.env.RATE_LIMIT_MAGIC_LINK_EMAIL_WINDOW_MS || 60 * 1000),
      max: Number(process.env.RATE_LIMIT_MAGIC_LINK_EMAIL_MAX || 3)
    },
    magicLinkIp: {
      windowMs: Number(process.env.RATE_LIMIT_MAGIC_LINK_IP_WINDOW_MS || 60 * 1000),
      max: Number(process.env.RATE_LIMIT_MAGIC_LINK_IP_MAX || 10)
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
