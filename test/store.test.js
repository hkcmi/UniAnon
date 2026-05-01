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
  const user = firstStore.upsertUser('stable-user-hash', 'example.edu');
  assert.equal(firstStore.setNickname(user.user_hash, 'persistent_user'), true);

  const space = firstStore.createSpace('Persistent Space', ['example.edu']);
  const post = firstStore.createPost(user.user_hash, space.id, 'This post should survive restart.');
  firstStore.createComment(post.id, user.user_hash, 'So should this comment.');
  firstStore.close();

  const secondStore = createStore({ databasePath });
  assert.equal(secondStore.users.get(user.user_hash).nickname, 'persistent_user');
  assert.equal(secondStore.spaces.get(space.id).name, 'Persistent Space');
  assert.equal(secondStore.posts.get(post.id).content, 'This post should survive restart.');
  assert.equal([...secondStore.comments.values()][0].content, 'So should this comment.');
  secondStore.close();

  fs.rmSync(dir, { recursive: true, force: true });
});
