import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createReportService } from '../src/report-service.js';

function fakeStore() {
  const createdCases = [];
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
