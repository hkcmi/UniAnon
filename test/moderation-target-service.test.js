import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createModerationTargetService } from '../src/moderation-target-service.js';

function fakeStore() {
  return {
    users: new Map([
      ['active-user', { user_hash: 'active-user', banned: false }],
      ['banned-user', { user_hash: 'banned-user', banned: true }]
    ]),
    posts: new Map([
      ['visible-post', { id: 'visible-post', user_hash: 'active-user', hidden: false }],
      ['hidden-post', { id: 'hidden-post', user_hash: 'active-user', hidden: true }]
    ]),
    comments: new Map([
      ['visible-comment', { id: 'visible-comment', user_hash: 'active-user', hidden: false }],
      ['hidden-comment', { id: 'hidden-comment', user_hash: 'active-user', hidden: true }]
    ])
  };
}

test('finds reportable targets only when they exist and are visible', () => {
  const service = createModerationTargetService(fakeStore());

  assert.deepEqual(service.findReportTarget('post', 'visible-post'), {
    exists: true,
    accusedHash: 'active-user'
  });
  assert.deepEqual(service.findReportTarget('comment', 'visible-comment'), {
    exists: true,
    accusedHash: 'active-user'
  });
  assert.deepEqual(service.findReportTarget('user', 'active-user'), {
    exists: true,
    accusedHash: 'active-user'
  });
  assert.equal(service.findReportTarget('post', 'hidden-post'), null);
  assert.equal(service.findReportTarget('comment', 'hidden-comment'), null);
  assert.equal(service.findReportTarget('post', 'missing-post'), null);
});

test('finds appealable targets only when they are punished', () => {
  const service = createModerationTargetService(fakeStore());

  assert.deepEqual(service.findAppealTarget('user', 'banned-user'), {
    ownerHash: 'banned-user',
    punished: true
  });
  assert.deepEqual(service.findAppealTarget('post', 'hidden-post'), {
    ownerHash: 'active-user',
    punished: true
  });
  assert.deepEqual(service.findAppealTarget('comment', 'hidden-comment'), {
    ownerHash: 'active-user',
    punished: true
  });
  assert.equal(service.findAppealTarget('user', 'active-user'), null);
  assert.equal(service.findAppealTarget('post', 'visible-post'), null);
  assert.equal(service.findAppealTarget('comment', 'visible-comment'), null);
});
