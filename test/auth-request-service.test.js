import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAuthRequestService } from '../src/auth-request-service.js';

test('records magic-link auth events without plaintext email', () => {
  const events = [];
  const service = createAuthRequestService({
    logAuthEvent(event) {
      events.push(event);
      return event;
    }
  }, { tokenTtlMs: 60_000 });

  service.recordMagicLinkRequest({
    emailDigest: 'digest',
    domainGroup: 'example.edu',
    success: false,
    reason: 'domain_not_allowed'
  });

  assert.deepEqual(events[0], {
    eventType: 'magic_link_requested',
    emailDigest: 'digest',
    domainGroup: 'example.edu',
    success: false,
    reason: 'domain_not_allowed'
  });
  assert.equal(JSON.stringify(events).includes('@'), false);
});

test('creates magic tokens through the service boundary', () => {
  const service = createAuthRequestService({
    createMagicToken(subjectHash, domainGroup, ttlMs, nullifier) {
      return `${subjectHash}:${domainGroup}:${ttlMs}:${nullifier}`;
    }
  }, { tokenTtlMs: 1234 });

  assert.equal(service.createMagicToken({
    subjectHash: 'subject',
    domainGroup: 'example.edu',
    nullifier: 'nullifier'
  }), 'subject:example.edu:1234:nullifier');
});
