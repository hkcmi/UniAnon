import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canAccessSpace, createContentService } from '../src/content-service.js';

function fakeStore() {
  const posts = new Map();
  const comments = new Map();
  return {
    spaces: new Map([
      ['public', { id: 'public', allowed_domains: [] }],
      ['org', { id: 'org', allowed_domains: ['example.org'] }]
    ]),
    posts,
    comments,
    createPost(userHash, spaceId, content) {
      const post = {
        id: `post-${posts.size + 1}`,
        user_hash: userHash,
        space_id: spaceId,
        content,
        created_at: `2026-05-14T00:0${posts.size}:00.000Z`,
        hidden: false
      };
      posts.set(post.id, post);
      return post;
    },
    createComment(postId, userHash, content) {
      const comment = {
        id: `comment-${comments.size + 1}`,
        post_id: postId,
        user_hash: userHash,
        content,
        created_at: `2026-05-14T00:1${comments.size}:00.000Z`,
        hidden: false
      };
      comments.set(comment.id, comment);
      return comment;
    }
  };
}

test('checks space access by domain', () => {
  assert.equal(canAccessSpace(null, { allowed_domains: [] }), true);
  assert.equal(canAccessSpace({ domain_group: 'example.org' }, { allowed_domains: ['example.org'] }), true);
  assert.equal(canAccessSpace({ domain_group: 'example.edu' }, { allowed_domains: ['example.org'] }), false);
  assert.equal(canAccessSpace(null, { allowed_domains: ['example.org'] }), false);
});

test('creates posts only in accessible spaces', () => {
  const service = createContentService(fakeStore());
  const eduUser = { user_hash: 'edu-user', domain_group: 'example.edu' };
  const orgUser = { user_hash: 'org-user', domain_group: 'example.org' };

  assert.deepEqual(service.createPost({
    user: eduUser,
    spaceId: 'org',
    content: 'Denied'
  }), {
    ok: false,
    status: 403,
    error: 'space_access_denied'
  });

  const result = service.createPost({
    user: orgUser,
    spaceId: 'org',
    content: 'Allowed'
  });
  assert.equal(result.ok, true);
  assert.equal(result.post.space_id, 'org');
});

test('lists only visible posts accessible to the current user', () => {
  const store = fakeStore();
  const service = createContentService(store);
  const eduUser = { user_hash: 'edu-user', domain_group: 'example.edu' };
  const orgUser = { user_hash: 'org-user', domain_group: 'example.org' };
  service.createPost({ user: eduUser, content: 'Public post' });
  service.createPost({ user: orgUser, spaceId: 'org', content: 'Org post' });
  store.posts.get('post-1').hidden = true;

  assert.deepEqual(service.listVisiblePosts({ user: null }).map((post) => post.content), []);
  assert.deepEqual(service.listVisiblePosts({ user: orgUser }).map((post) => post.content), ['Org post']);
  assert.deepEqual(service.listVisiblePosts({ user: eduUser }).map((post) => post.content), []);
});

test('creates comments only on visible posts', () => {
  const store = fakeStore();
  const service = createContentService(store);
  const user = { user_hash: 'user-a', domain_group: 'example.edu' };
  const post = service.createPost({ user, content: 'Visible post' }).post;

  const created = service.createComment({ user, postId: post.id, content: 'Visible comment' });
  assert.equal(created.ok, true);
  assert.equal(created.comment.post_id, post.id);

  store.posts.get(post.id).hidden = true;
  assert.deepEqual(service.createComment({ user, postId: post.id, content: 'Denied comment' }), {
    ok: false,
    status: 404,
    error: 'post_not_found'
  });
});
