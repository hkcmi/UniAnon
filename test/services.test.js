import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServices } from '../src/services.js';

test('creates default service boundaries around shared infrastructure', () => {
  const services = createServices({
    storeOptions: { databasePath: ':memory:' },
    rateLimiterOptions: { redisUrl: '' },
    oidcStateTtlMs: 1000
  });

  try {
    assert.equal(typeof services.store.upsertUser, 'function');
    assert.equal(typeof services.rateLimiter.consume, 'function');
    assert.equal(typeof services.mailer.sendMagicLink, 'function');
    assert.equal(typeof services.oidcStateStore.save, 'function');
    assert.equal(typeof services.sessionService.create, 'function');
  } finally {
    services.store.close();
  }
});

test('allows dependency injection for server tests and future app factories', () => {
  const injectedStore = {
    createSession() {
      return 'injected-session';
    },
    findSession() {
      return null;
    }
  };
  const injectedRateLimiter = { consume() {} };
  const injectedMailer = { sendMagicLink() {} };
  const injectedOidcStateStore = { save() {}, consume() {} };
  const services = createServices({
    store: injectedStore,
    rateLimiter: injectedRateLimiter,
    mailer: injectedMailer,
    oidcStateStore: injectedOidcStateStore
  });

  assert.equal(services.store, injectedStore);
  assert.equal(services.rateLimiter, injectedRateLimiter);
  assert.equal(services.mailer, injectedMailer);
  assert.equal(services.oidcStateStore, injectedOidcStateStore);
  assert.equal(services.sessionService.create('user-a'), 'injected-session');
});
