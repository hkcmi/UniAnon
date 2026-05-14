import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createReportService } from '../src/report-service.js';

function fakeStore() {
  const createdCases = [];
  let nextReportId = 1;
  return {
    reports: new Map([
      ['report-a', { id: 'report-a', target_type: 'post', target_id: 'post-a', weight: 2 }],
      ['report-b', { id: 'report-b', target_type: 'post', target_id: 'post-a', weight: 1 }],
      ['report-c', { id: 'report-c', target_type: 'user', target_id: 'user-a', weight: 3 }]
    ]),
    createdCases,
    findOpenCase(targetType, targetId) {
      if (targetType === 'post' && targetId === 'existing-case-post') {
        return { id: 'existing-case' };
      }
      return null;
    },
    createModerationCase(targetType, targetId, accusedHash, reportIds) {
      const moderationCase = { id: 'new-case', targetType, targetId, accusedHash, reportIds };
      createdCases.push(moderationCase);
      return moderationCase;
    },
    createReport(actorHash, targetType, targetId, reason, weight) {
      const existing = [...this.reports.values()].find((report) => {
        return report.actor_hash === actorHash
          && report.target_type === targetType
          && report.target_id === targetId;
      });
      if (existing) {
        return { report: existing, duplicate: true };
      }

      const report = {
        id: `new-report-${nextReportId++}`,
        actor_hash: actorHash,
        target_type: targetType,
        target_id: targetId,
        reason,
        weight
      };
      this.reports.set(report.id, report);
      return { report, duplicate: false };
    }
  };
}

test('summarizes report weight for one target', () => {
  const service = createReportService(fakeStore());

  assert.deepEqual(service.summarizeTargetReports('post', 'post-a'), {
    reports: [
      { id: 'report-a', target_type: 'post', target_id: 'post-a', weight: 2 },
      { id: 'report-b', target_type: 'post', target_id: 'post-a', weight: 1 }
    ],
    reportIds: ['report-a', 'report-b'],
    reportWeight: 3
  });
});

test('opens moderation case when report threshold is reached', () => {
  const store = fakeStore();
  const service = createReportService(store, {
    thresholdForAccused: () => 3
  });

  const result = service.openCaseIfThresholdReached('post', 'post-a', 'accused-user');

  assert.equal(result.reportWeight, 3);
  assert.equal(result.reportThreshold, 3);
  assert.equal(result.moderationCase.id, 'new-case');
  assert.deepEqual(store.createdCases[0].reportIds, ['report-a', 'report-b']);
});

test('calculates report weight from trust and account state', () => {
  const service = createReportService(fakeStore());

  assert.equal(service.reportWeight({ banned: true, nickname: 'banned', trust_level: 3 }), 0);
  assert.equal(service.reportWeight({ banned: false, nickname: null, trust_level: 3 }), 0);
  assert.equal(service.reportWeight({ banned: false, nickname: 'new', trust_level: 0 }), 1);
  assert.equal(service.reportWeight({ banned: false, nickname: 'trusted', trust_level: 2 }), 3);
  assert.equal(service.reportWeight({ banned: false, nickname: 'core', trust_level: 4 }), 3);
});

test('submits reports and opens cases through the service boundary', () => {
  const store = fakeStore();
  const service = createReportService(store, {
    thresholdForAccused: () => 4
  });

  const result = service.submitReport({
    actor: { user_hash: 'reporter', banned: false, nickname: 'reporter', trust_level: 1 },
    targetType: 'post',
    targetId: 'post-a',
    reason: 'needs review',
    accusedHash: 'accused-user'
  });

  assert.equal(result.ok, true);
  assert.equal(result.report.weight, 2);
  assert.equal(result.reportSummary.reportWeight, 5);
  assert.equal(result.reportSummary.moderationCase.id, 'new-case');
});

test('returns duplicate report conflicts without opening another case', () => {
  const store = fakeStore();
  store.reports.set('duplicate', {
    id: 'duplicate',
    actor_hash: 'reporter',
    target_type: 'post',
    target_id: 'post-a',
    weight: 1
  });
  const service = createReportService(store, {
    thresholdForAccused: () => 1
  });

  const result = service.submitReport({
    actor: { user_hash: 'reporter', banned: false, nickname: 'reporter', trust_level: 1 },
    targetType: 'post',
    targetId: 'post-a',
    reason: 'needs review',
    accusedHash: 'accused-user'
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
  assert.equal(result.error, 'duplicate_report');
  assert.equal(store.createdCases.length, 0);
});

test('does not open duplicate or below-threshold cases', () => {
  const store = fakeStore();
  const service = createReportService(store, {
    thresholdForAccused: () => 10
  });

  const belowThreshold = service.openCaseIfThresholdReached('post', 'post-a', 'accused-user');
  const existing = service.openCaseIfThresholdReached('post', 'existing-case-post', 'accused-user');

  assert.equal(belowThreshold.moderationCase, null);
  assert.equal(belowThreshold.reportWeight, 3);
  assert.equal(existing.moderationCase.id, 'existing-case');
  assert.equal(store.createdCases.length, 0);
});
