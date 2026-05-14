import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAuthService } from '../src/auth-service.js';
import { createMembershipAssertion } from '../src/membership-assertion.js';

function fakeStore({ banned = false } = {}) {
  const users = new Map();
  const magicTokens = new Map([
    ['magic-token', {
      subject_hash: 'subject-a',
      domain_group: 'example.edu',
      nullifier: 'nullifier-a'
    }]
  ]);

  return {
    users,
    magicTokens,
    upsertUser(subjectHash, domainGroup, nullifier) {
      const user = users.get(subjectHash) || {
        user_hash: subjectHash,
        nickname: null,
        domain_group: domainGroup,
        trust_level: 0,
        created_at: '2026-05-14T00:00:00.000Z',
        banned,
        roles: []
      };
      users.set(subjectHash, user);
      return user;
    },
    consumeMagicToken(token) {
      const record = magicTokens.get(token);
      magicTokens.delete(token);
      return record || null;
    }
  };
}

function fakeSessionService() {
  return {
    create(userHash) {
      return `session-for-${userHash}`;
    }
  };
}

test('verifies magic tokens into membership assertions and session payloads', () => {
  const service = createAuthService({
    store: fakeStore(),
    sessionService: fakeSessionService(),
    sessionTtlMs: 60_000
  });

  const result = service.verifyMagicToken('magic-token');

  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.equal(result.payload.session_token, 'session-for-subject-a');
  assert.equal(typeof result.payload.membership_assertion, 'string');
  assert.equal(result.payload.expires_in, 60);
  assert.equal(result.payload.user.user_hash, 'subject-a');
  assert.equal(Object.hasOwn(result.payload.user, 'email'), false);
});

test('returns banned user payload without creating a normal session', () => {
  const service = createAuthService({
    store: fakeStore({ banned: true }),
    sessionService: fakeSessionService(),
    sessionTtlMs: 60_000
  });

  const result = service.verifyMagicToken('magic-token');

  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.equal(result.payload.error, 'user_banned');
  assert.equal(typeof result.payload.membership_assertion, 'string');
  assert.equal(Object.hasOwn(result.payload, 'session_token'), false);
});

test('exchanges valid membership assertions without echoing the assertion', () => {
  const service = createAuthService({
    store: fakeStore(),
    sessionService: fakeSessionService(),
    sessionTtlMs: 60_000
  });
  const assertion = createMembershipAssertion({
    subjectHash: 'assertion-subject',
    domainGroup: 'example.edu',
    nullifier: 'assertion-nullifier'
  });

  const result = service.exchangeMembershipAssertion(assertion);

  assert.equal(result.ok, true);
  assert.equal(result.payload.session_token, 'session-for-assertion-subject');
  assert.equal(Object.hasOwn(result.payload, 'membership_assertion'), false);
});

test('rejects invalid magic tokens and invalid membership assertions', () => {
  const service = createAuthService({
    store: fakeStore(),
    sessionService: fakeSessionService(),
    sessionTtlMs: 60_000
  });

  assert.deepEqual(service.verifyMagicToken('missing-token'), {
    ok: false,
    status: 400,
    payload: { error: 'invalid_or_expired_token' }
  });
  assert.deepEqual(service.exchangeMembershipAssertion('not-an-assertion'), {
    ok: false,
    status: 400,
    payload: { error: 'invalid_or_expired_assertion' }
  });
});
