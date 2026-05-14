import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildMetricsSummary, privacyCount } from '../src/metrics-service.js';

function fakeStore(records) {
  return {
    users: new Map((records.users || []).map((record) => [record.id, record])),
    posts: new Map((records.posts || []).map((record) => [record.id, record])),
    comments: new Map((records.comments || []).map((record) => [record.id, record])),
    reports: new Map((records.reports || []).map((record) => [record.id, record])),
    moderationCases: new Map((records.moderationCases || []).map((record) => [record.id, record])),
    appealCases: new Map((records.appealCases || []).map((record) => [record.id, record])),
    auditLog: records.auditLog || []
  };
}

test('suppresses low-count metric buckets', () => {
  assert.deepEqual(privacyCount(0), { count: 0, suppressed: false });
  assert.deepEqual(privacyCount(1), { count: null, suppressed: true, range: '1-9' });
  assert.deepEqual(privacyCount(9), { count: null, suppressed: true, range: '1-9' });
  assert.deepEqual(privacyCount(10), { count: 10, suppressed: false });
});

test('builds redacted aggregate metrics from store collections', () => {
  const now = Date.parse('2026-05-14T00:00:00.000Z');
  const recent = '2026-05-13T12:00:00.000Z';
  const old = '2026-01-01T12:00:00.000Z';
  const store = fakeStore({
    users: [
      { id: 'user-a', created_at: recent },
      { id: 'old-user', created_at: old }
    ],
    posts: [{ id: 'post-a', created_at: recent }],
    comments: [{ id: 'comment-a', created_at: recent }],
    reports: [{ id: 'report-a', created_at: recent }],
    moderationCases: [{ id: 'case-a', created_at: recent }],
    appealCases: [{ id: 'appeal-a', created_at: recent }],
    auditLog: [{ id: 'audit-a', created_at: recent }]
  });

  const summary = buildMetricsSummary(store, { now, retentionDays: 90 });

  assert.equal(summary.generated_at, '2026-05-14T00:00:00.000Z');
  assert.equal(summary.retention_days, 90);
  assert.equal(summary.min_activity_bucket_size, 10);
  assert.equal(summary.buckets.length, 1);
  assert.equal(summary.buckets[0].date, '2026-05-13');
  assert.deepEqual(summary.buckets[0].accounts_created, { count: null, suppressed: true, range: '1-9' });
  assert.equal(JSON.stringify(summary).includes('user-a'), false);
  assert.equal(JSON.stringify(summary).includes('post-a'), false);
  assert.equal(JSON.stringify(summary).includes('old-user'), false);
});
