import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createContentViewService } from '../src/content-view-service.js';

test('serializes visible post comments with nicknames only', () => {
  const store = {
    users: new Map([
      ['author-hash', { nickname: 'author' }],
      ['commenter-hash', { nickname: 'commenter' }]
    ]),
    comments: new Map([
      ['comment-a', {
        id: 'comment-a',
        post_id: 'post-a',
        user_hash: 'commenter-hash',
        content: 'Visible comment',
        created_at: '2026-05-14T00:01:00.000Z',
        hidden: false
      }],
      ['comment-hidden', {
        id: 'comment-hidden',
        post_id: 'post-a',
        user_hash: 'commenter-hash',
        content: 'Hidden comment',
        created_at: '2026-05-14T00:02:00.000Z',
        hidden: true
      }]
    ])
  };
  const service = createContentViewService(store);
  const post = service.serializePost({
    id: 'post-a',
    space_id: 'public',
    user_hash: 'author-hash',
    content: 'Visible post',
    created_at: '2026-05-14T00:00:00.000Z'
  });
  const json = JSON.stringify(post);

  assert.equal(post.nickname, 'author');
  assert.equal(post.comments.length, 1);
  assert.equal(post.comments[0].nickname, 'commenter');
  assert.equal(post.comments[0].content, 'Visible comment');
  assert.equal(json.includes('author-hash'), false);
  assert.equal(json.includes('commenter-hash'), false);
  assert.equal(json.includes('Hidden comment'), false);
});

test('uses deleted nickname fallback for missing authors', () => {
  const service = createContentViewService({
    users: new Map(),
    comments: new Map()
  });

  const post = service.serializePost({
    id: 'post-a',
    space_id: 'public',
    user_hash: 'missing-user',
    content: 'Post from a missing author',
    created_at: '2026-05-14T00:00:00.000Z'
  });

  assert.equal(post.nickname, '[deleted]');
});
