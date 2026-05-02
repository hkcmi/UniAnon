import assert from 'node:assert/strict';
import { test } from 'node:test';
import { config, validateProductionConfig } from '../src/config.js';

function productionConfig(overrides = {}) {
  return {
    ...config,
    serverSecret: 'server-secret-123456789012345678901234',
    authSubjectSecret: 'subject-secret-12345678901234567890123',
    authLogSecret: 'auth-log-secret-1234567890123456789012',
    nullifierSecret: 'nullifier-secret-123456789012345678901',
    membershipAssertionSecret: 'assertion-secret-12345678901234567890',
    allowedDomains: ['example.edu'],
    emailDelivery: 'smtp',
    appBaseUrl: 'https://unianon.example.edu',
    ...overrides
  };
}

test('allows strong production configuration', () => {
  assert.deepEqual(validateProductionConfig(productionConfig(), 'production'), []);
});

test('rejects unsafe production configuration', () => {
  const issues = validateProductionConfig(productionConfig({
    serverSecret: 'dev-only-change-me',
    authSubjectSecret: 'same-secret-123456789012345678901',
    authLogSecret: 'same-secret-123456789012345678901',
    emailDelivery: 'dev',
    appBaseUrl: 'http://localhost:3000'
  }), 'production');

  assert.equal(issues.some((issue) => issue.includes('SERVER_SECRET')), true);
  assert.equal(issues.some((issue) => issue.includes('distinct')), true);
  assert.equal(issues.some((issue) => issue.includes('EMAIL_DELIVERY=dev')), true);
  assert.equal(issues.some((issue) => issue.includes('localhost')), true);
});
