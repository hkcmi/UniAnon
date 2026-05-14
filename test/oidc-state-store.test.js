import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOidcStateStore } from '../src/oidc-state-store.js';

test('OIDC state store consumes states once', () => {
  let currentTime = 1000;
  const store = createOidcStateStore({
    ttlMs: 1000,
    now: () => currentTime
  });

  store.save('state-a', 'nonce-a');

  assert.deepEqual(store.consume('state-a'), {
    nonce: 'nonce-a',
    expires_at: 2000
  });
  assert.equal(store.consume('state-a'), null);
});

test('OIDC state store rejects expired states and prunes stale entries', () => {
  let currentTime = 1000;
  const store = createOidcStateStore({
    ttlMs: 1000,
    now: () => currentTime
  });

  store.save('state-a', 'nonce-a');
  currentTime = 2500;

  assert.equal(store.consume('state-a'), null);
  store.save('state-b', 'nonce-b');
  assert.equal(store.size(), 1);
  assert.equal(store.consume('state-b').nonce, 'nonce-b');
});
