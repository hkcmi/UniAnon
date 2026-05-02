import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createMembershipAssertion,
  verifyMembershipAssertion
} from '../src/membership-assertion.js';

test('creates and verifies signed membership assertions', () => {
  const assertion = createMembershipAssertion({
    subjectHash: 'subject-123',
    domainGroup: 'example.edu',
    nullifier: 'nullifier-123'
  }, {
    secret: 'test-secret',
    ttlMs: 60_000
  });

  const payload = verifyMembershipAssertion(assertion, { secret: 'test-secret' });
  assert.equal(payload.sub, 'subject-123');
  assert.equal(payload.iss, 'unianon.auth');
  assert.equal(payload.aud, 'unianon-local');
  assert.equal(payload.domain_group, 'example.edu');
  assert.equal(payload.nullifier, 'nullifier-123');
});

test('rejects membership assertions for another community', () => {
  const assertion = createMembershipAssertion({
    subjectHash: 'subject-123',
    domainGroup: 'example.edu',
    nullifier: 'nullifier-123'
  }, {
    communityId: 'other-community',
    secret: 'test-secret',
    ttlMs: 60_000
  });

  assert.equal(verifyMembershipAssertion(assertion, {
    communityId: 'unianon-local',
    secret: 'test-secret'
  }), null);
});

test('rejects tampered membership assertions', () => {
  const assertion = createMembershipAssertion({
    subjectHash: 'subject-123',
    domainGroup: 'example.edu',
    nullifier: 'nullifier-123'
  }, {
    secret: 'test-secret',
    ttlMs: 60_000
  });

  const tampered = assertion.replace('a', 'b');
  assert.equal(verifyMembershipAssertion(tampered, { secret: 'test-secret' }), null);
});

test('rejects expired membership assertions', () => {
  const assertion = createMembershipAssertion({
    subjectHash: 'subject-123',
    domainGroup: 'example.edu',
    nullifier: 'nullifier-123'
  }, {
    secret: 'test-secret',
    ttlMs: -1
  });

  assert.equal(verifyMembershipAssertion(assertion, { secret: 'test-secret' }), null);
});
