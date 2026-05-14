import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGovernanceViewService, excerpt, publicAuditRef } from '../src/governance-view-service.js';

function fakeStore() {
  return {
    users: new Map([
      ['author-hash', {
        user_hash: 'author-hash',
        nickname: 'author',
        domain_group: 'example.edu',
        trust_level: 2,
        roles: [],
        banned: false
      }],
      ['reporter-hash', {
        user_hash: 'reporter-hash',
        nickname: 'reporter',
        domain_group: 'example.edu',
        trust_level: 2,
        roles: [],
        banned: false
      }]
    ]),
    posts: new Map([
      ['post-a', {
        id: 'post-a',
        user_hash: 'author-hash',
        content: 'Sensitive content that should be excerpted for governance review.',
        hidden: false,
        created_at: '2026-05-14T00:00:00.000Z'
      }]
    ]),
    comments: new Map(),
    reports: new Map([
      ['report-a', {
        id: 'report-a',
        actor_hash: 'reporter-hash',
        reason: 'Needs review',
        weight: 2,
        created_at: '2026-05-14T00:01:00.000Z'
      }]
    ])
  };
}

test('creates stable public audit refs without returning raw identifiers', () => {
  const ref = publicAuditRef('raw-user-hash', 'audit-secret');

  assert.equal(ref, publicAuditRef('raw-user-hash', 'audit-secret'));
  assert.equal(ref.length, 12);
  assert.notEqual(ref, 'raw-user-hash');
});

test('normalizes and limits evidence excerpts', () => {
  assert.equal(excerpt('  one\n two\tthree  ', 20), 'one two three');
  assert.equal(excerpt('abcdef', 4), 'abc...');
  assert.equal(excerpt(null), '');
});

test('serializes governance cases with redacted actor references and evidence excerpts', () => {
  const service = createGovernanceViewService(fakeStore(), {
    auditSecret: 'audit-secret',
    approvalThresholdForCase: () => 5
  });
  const serialized = service.serializeCase({
    id: 'case-a',
    target_type: 'post',
    target_id: 'post-a',
    accused_hash: 'author-hash',
    report_ids: ['report-a'],
    juror_hashes: ['reporter-hash'],
    status: 'open',
    votes: [{
      voter_hash: 'reporter-hash',
      decision: 'violation',
      action: 'hide_content',
      weight: 2,
      created_at: '2026-05-14T00:02:00.000Z'
    }],
    created_at: '2026-05-14T00:00:00.000Z',
    resolved_at: null,
    resolution: null
  });
  const json = JSON.stringify(serialized);

  assert.equal(serialized.approval_threshold, 5);
  assert.equal(serialized.target.content_excerpt, 'Sensitive content that should be excerpted for governance review.');
  assert.equal(serialized.accused.user_ref.length, 12);
  assert.equal(serialized.reports[0].actor_ref.length, 12);
  assert.equal(serialized.votes[0].actor_ref.length, 12);
  assert.equal(json.includes('reporter-hash'), false);
});

test('serializes appeal cases with redacted voter references', () => {
  const service = createGovernanceViewService(fakeStore(), { auditSecret: 'audit-secret' });
  const serialized = service.serializeAppealCase({
    id: 'appeal-a',
    appellant_hash: 'author-hash',
    target_type: 'post',
    target_id: 'post-a',
    reason: 'Please restore',
    status: 'open',
    votes: [{
      voter_hash: 'reporter-hash',
      decision: 'approve',
      weight: 2,
      created_at: '2026-05-14T00:02:00.000Z'
    }],
    created_at: '2026-05-14T00:00:00.000Z',
    resolved_at: null,
    resolution: null
  });

  assert.equal(serialized.approve_weight, 2);
  assert.equal(serialized.votes[0].actor_ref.length, 12);
  assert.equal(JSON.stringify(serialized.votes).includes('reporter-hash'), false);
});
