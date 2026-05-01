import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createStore } from '../src/store.js';

test('persists core community data across store restarts', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unianon-store-'));
  const databasePath = path.join(dir, 'unianon.sqlite');

  const firstStore = createStore({ databasePath });
  const user = firstStore.upsertUser('stable-user-hash', 'example.edu', 'stable-nullifier');
  assert.equal(firstStore.setNickname(user.user_hash, 'persistent_user'), true);

  const space = firstStore.createSpace('Persistent Space', ['example.edu']);
  const post = firstStore.createPost(user.user_hash, space.id, 'This post should survive restart.');
  firstStore.createComment(post.id, user.user_hash, 'So should this comment.');
  firstStore.logAuthEvent({
    eventType: 'magic_link_requested',
    emailDigest: 'a'.repeat(64),
    domainGroup: 'example.edu',
    success: true,
    reason: 'sent'
  });
  const appealCase = firstStore.createAppealCase(user.user_hash, 'user', user.user_hash, 'Please review.');
  firstStore.addAppealVote(appealCase.id, 'juror-hash', 'approve', 3);
  firstStore.close();

  const secondStore = createStore({ databasePath });
  assert.equal(secondStore.users.get(user.user_hash).nickname, 'persistent_user');
  assert.equal(secondStore.nullifiers.get('stable-nullifier'), user.user_hash);
  assert.equal(secondStore.spaces.get(space.id).name, 'Persistent Space');
  assert.equal(secondStore.posts.get(post.id).content, 'This post should survive restart.');
  assert.equal([...secondStore.comments.values()][0].content, 'So should this comment.');
  assert.equal(secondStore.authEvents[0].email_digest, 'a'.repeat(64));
  assert.equal(secondStore.appealCases.get(appealCase.id).votes[0].decision, 'approve');
  secondStore.close();

  fs.rmSync(dir, { recursive: true, force: true });
});

test('reuses an existing user when the nullifier already exists', () => {
  const store = createStore({ databasePath: ':memory:' });
  const first = store.upsertUser('public-user-a', 'example.edu', 'member-nullifier');
  const second = store.upsertUser('public-user-b', 'example.edu', 'member-nullifier');

  assert.equal(second.user_hash, first.user_hash);
  assert.equal(store.users.size, 1);
  assert.equal(store.nullifiers.get('member-nullifier'), 'public-user-a');

  store.close();
});
