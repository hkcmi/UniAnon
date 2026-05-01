import 'dotenv/config';

const defaultDomains = ['example.edu', 'example.org', 'company.com'];

export const config = {
  port: Number(process.env.PORT || 3000),
  databasePath: process.env.DATABASE_PATH || (process.env.NODE_ENV === 'test' ? ':memory:' : 'data/unianon.sqlite'),
  serverSecret: process.env.SERVER_SECRET || 'dev-only-change-me',
  allowedDomains: (process.env.ALLOWED_DOMAINS || defaultDomains.join(','))
    .split(',')
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean),
  tokenTtlMs: Number(process.env.MAGIC_TOKEN_TTL_MS || 15 * 60 * 1000),
  reportWeightThreshold: Number(process.env.REPORT_WEIGHT_THRESHOLD || 3),
  juryApprovalWeight: Number(process.env.JURY_APPROVAL_WEIGHT || 3),
  adminProtectionApprovalWeight: Number(process.env.ADMIN_PROTECTION_APPROVAL_WEIGHT || 8)
};
