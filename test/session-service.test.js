import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bearerTokenFromHeader, createSessionService } from '../src/session-service.js';

test('extracts bearer tokens from authorization headers', () => {
  assert.equal(bearerTokenFromHeader('Bearer session-token'), 'session-token');
  assert.equal(bearerTokenFromHeader('Basic session-token'), null);
  assert.equal(bearerTokenFromHeader(''), null);
  assert.equal(bearerTokenFromHeader(null), null);
});

test('session service resolves active and banned users through store boundary', () => {
  const users = new Map([
    ['active-token', { user_hash: 'active-user', banned: false }],
    ['banned-token', { user_hash: 'banned-user', banned: true }]
  ]);
  const created = [];
  const service = createSessionService({
    createSession(userHash) {
      created.push(userHash);
      return `token-for-${userHash}`;
    },
    findSession(token) {
      return users.get(token) || null;
    }
  });

  assert.equal(service.create('active-user'), 'token-for-active-user');
  assert.deepEqual(created, ['active-user']);
  assert.equal(service.findUserByAuthorization('Bearer active-token').user_hash, 'active-user');
  assert.equal(service.findActiveUserByAuthorization('Bearer active-token').user_hash, 'active-user');
  assert.equal(service.findUserByAuthorization('Bearer banned-token').user_hash, 'banned-user');
  assert.equal(service.findActiveUserByAuthorization('Bearer banned-token'), null);
});
