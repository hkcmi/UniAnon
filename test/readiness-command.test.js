import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { createStore } from '../src/store.js';

const execFileAsync = promisify(execFile);

function safeEnv(databasePath, overrides = {}) {
  return {
    ...process.env,
    NODE_ENV: 'production',
    DATABASE_PATH: databasePath,
    SERVER_SECRET: 'server-readiness-test-secret-123456789012',
    AUTH_SUBJECT_SECRET: 'subject-readiness-test-secret-12345678901',
    AUTH_LOG_SECRET: 'auth-log-readiness-test-secret-123456789',
    NULLIFIER_SECRET: 'nullifier-readiness-test-secret-123456789',
    MEMBERSHIP_ASSERTION_SECRET: 'assertion-readiness-test-secret-123456789',
    ALLOWED_DOMAINS: 'example.edu',
    APP_BASE_URL: 'https://unianon-readiness.example.edu',
    EMAIL_DELIVERY: 'smtp',
    EMAIL_FROM: 'UniAnon <no-reply@unianon-readiness.example.edu>',
    SMTP_HOST: 'smtp.invalid',
    REDIS_URL: 'redis://localhost:6379',
    ...overrides
  };
}

test('production readiness command verifies schema migrations', async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'unianon-readiness-test-'));
  const databasePath = path.join(tempDir, 'unianon.sqlite');

  try {
    const store = createStore({ databasePath });
    store.close();

    const { stdout } = await execFileAsync(process.execPath, ['scripts/readiness-production.js'], {
      cwd: process.cwd(),
      env: safeEnv(databasePath)
    });

    assert.match(stdout, /\[PASS\] database migrations:/);
    assert.match(stdout, /0 failures/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('production readiness command allows OIDC-only email-disabled configuration', async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'unianon-readiness-oidc-test-'));
  const databasePath = path.join(tempDir, 'unianon.sqlite');

  try {
    const store = createStore({ databasePath });
    store.close();

    const { stdout } = await execFileAsync(process.execPath, ['scripts/readiness-production.js'], {
      cwd: process.cwd(),
      env: safeEnv(databasePath, {
        EMAIL_DELIVERY: 'disabled',
        EMAIL_FROM: 'UniAnon <no-reply@unianon-readiness.example.edu>',
        SMTP_HOST: '',
        OIDC_ISSUER: 'https://idp.example.edu',
        OIDC_CLIENT_ID: 'readiness-client',
        OIDC_REDIRECT_URI: 'https://unianon-readiness.example.edu/auth/oidc/callback',
        OIDC_SCOPES: 'openid',
        OIDC_DOMAIN_CLAIMS: 'hd,domain,domain_group'
      })
    });

    assert.match(stdout, /\[PASS\] OIDC:/);
    assert.match(stdout, /\[PASS\] OIDC scopes:/);
    assert.doesNotMatch(stdout, /\[FAIL\] SMTP:/);
    assert.match(stdout, /0 failures/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('production readiness command fails unsafe production config', async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'unianon-readiness-fail-test-'));
  const databasePath = path.join(tempDir, 'unianon.sqlite');

  try {
    const store = createStore({ databasePath });
    store.close();

    await assert.rejects(
      execFileAsync(process.execPath, ['scripts/readiness-production.js'], {
        cwd: process.cwd(),
        env: safeEnv(databasePath, {
          SERVER_SECRET: 'dev-only-change-me',
          EMAIL_DELIVERY: 'dev',
          APP_BASE_URL: 'http://localhost:3000'
        })
      }),
      (error) => {
        assert.match(error.stdout, /\[FAIL\] production config:/);
        assert.match(error.stdout, /EMAIL_DELIVERY=dev/);
        return true;
      }
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
