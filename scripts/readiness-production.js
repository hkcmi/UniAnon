import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { config, validateProductionConfig } from '../src/config.js';

const requiredDocs = [
  'PRIVACY.md',
  'THREAT_MODEL.md',
  'PRODUCTION_PRIVACY_CHECKLIST.md',
  'ANALYTICS_POLICY.md',
  'DEPLOYMENT.md',
  'BACKUP_RESTORE.md',
  'INCIDENT_RESPONSE.md',
  'FIRST_COMMUNITY_LAUNCH.md'
];

const checks = [];

function pass(name, detail) {
  checks.push({ status: 'PASS', name, detail });
}

function warn(name, detail) {
  checks.push({ status: 'WARN', name, detail });
}

function fail(name, detail) {
  checks.push({ status: 'FAIL', name, detail });
}

function checkProductionConfig() {
  if (process.env.NODE_ENV === 'production') {
    pass('NODE_ENV', 'production mode is enabled.');
  } else {
    fail('NODE_ENV', 'set NODE_ENV=production for a real deployment.');
  }

  const issues = validateProductionConfig(config, 'production');
  if (issues.length === 0) {
    pass('production config', 'required production safety checks passed.');
  } else {
    for (const issue of issues) {
      fail('production config', issue);
    }
  }
}

function checkAuthMode() {
  if (config.oidc.issuer || config.oidc.clientId || config.oidc.redirectUri) {
    if (config.oidc.issuer && config.oidc.clientId && config.oidc.redirectUri) {
      pass('OIDC', 'issuer, client id, and redirect URI are configured.');
    } else {
      fail('OIDC', 'issuer, client id, and redirect URI must be configured together.');
    }

    const broadScopes = config.oidc.scopes.filter((scope) => ['email', 'profile', 'name'].includes(scope));
    if (broadScopes.length === 0) {
      pass('OIDC scopes', 'minimal-claims scopes are configured.');
    } else {
      warn('OIDC scopes', `broad identity scopes weaken privacy: ${broadScopes.join(', ')}`);
    }
  }

  if (config.emailDelivery === 'smtp') {
    if (config.smtp.host) {
      pass('SMTP', 'SMTP delivery mode has a host configured.');
    } else {
      fail('SMTP', 'EMAIL_DELIVERY=smtp requires SMTP_HOST.');
    }

    if (config.emailFrom && !config.emailFrom.includes('localhost')) {
      pass('email sender', 'EMAIL_FROM does not use localhost.');
    } else {
      fail('email sender', 'EMAIL_FROM should use a production sender domain.');
    }

    warn('SMTP privacy', 'SMTP providers necessarily see recipient addresses; highest privacy mode should use minimal-claims OIDC or future anonymous credentials.');
  }

  if (config.emailDelivery === 'sendgrid') {
    if (config.sendgrid.apiKey) {
      pass('SendGrid', 'SENDGRID_API_KEY is configured.');
    } else {
      fail('SendGrid', 'EMAIL_DELIVERY=sendgrid requires SENDGRID_API_KEY.');
    }

    if (config.emailFrom && !config.emailFrom.includes('localhost')) {
      pass('email sender', 'EMAIL_FROM does not use localhost.');
    } else {
      fail('email sender', 'EMAIL_FROM should use a production sender domain.');
    }

    warn('SendGrid privacy', 'SendGrid necessarily sees recipient addresses; highest privacy mode should use minimal-claims OIDC or future anonymous credentials.');
  }
}

function checkRedis() {
  if (config.redisUrl) {
    pass('Redis', 'REDIS_URL is configured for shared rate-limit counters.');
  } else {
    warn('Redis', 'REDIS_URL is empty; use Redis for Docker, multi-process, or production deployments.');
  }
}

function checkDocs() {
  for (const doc of requiredDocs) {
    if (fs.existsSync(doc)) {
      pass('required document', doc);
    } else {
      fail('required document', `${doc} is missing.`);
    }
  }
}

function checkDatabase() {
  if (process.env.READINESS_SKIP_DB === 'true') {
    warn('database', 'database checks skipped with READINESS_SKIP_DB=true.');
    return;
  }

  if (!config.databasePath || config.databasePath === ':memory:') {
    fail('database', 'DATABASE_PATH must point to the production SQLite database.');
    return;
  }

  if (!fs.existsSync(config.databasePath)) {
    fail('database', `database file does not exist: ${config.databasePath}`);
    return;
  }

  let db;
  try {
    db = new DatabaseSync(config.databasePath, { readOnly: true });
    const migrationRows = db.prepare('SELECT version, name FROM schema_migrations ORDER BY version').all();
    if (migrationRows.length > 0) {
      pass('database migrations', `${migrationRows.length} migrations recorded; latest is ${migrationRows.at(-1).version}.`);
    } else {
      fail('database migrations', 'schema_migrations exists but has no applied migrations.');
    }
  } catch (error) {
    fail('database migrations', error.message);
  } finally {
    db?.close();
  }
}

checkProductionConfig();
checkAuthMode();
checkRedis();
checkDocs();
checkDatabase();

for (const check of checks) {
  console.log(`[${check.status}] ${check.name}: ${check.detail}`);
}

const failures = checks.filter((check) => check.status === 'FAIL');
const warnings = checks.filter((check) => check.status === 'WARN');

console.log(`\nProduction readiness: ${checks.length - failures.length - warnings.length} passed, ${warnings.length} warnings, ${failures.length} failures.`);

if (failures.length > 0) {
  process.exitCode = 1;
}
