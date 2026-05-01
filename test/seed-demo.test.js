import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStore } from '../src/store.js';
import { seedDemoData } from '../src/seed-demo.js';

test('seeds local demo users, spaces, posts, and a governance case', () => {
  const store = createStore({ databasePath: ':memory:' });

  const firstSeed = seedDemoData(store);
  const secondSeed = seedDemoData(store);

  assert.equal(firstSeed.users.moderator.nickname, 'demo_moderator');
  assert.equal(firstSeed.users.moderator.roles.includes('moderator'), true);
  assert.equal(firstSeed.users.juror.trust_level, 2);
  assert.equal(firstSeed.spaces.edu.allowed_domains[0], 'example.edu');
  assert.equal(firstSeed.spaces.org.allowed_domains[0], 'example.org');
  assert.equal(firstSeed.case.status, 'open');
  assert.equal(secondSeed.users.moderator.user_hash, firstSeed.users.moderator.user_hash);
  assert.equal([...store.users.values()].filter((user) => user.nickname === 'demo_moderator').length, 1);

  store.close();
});
