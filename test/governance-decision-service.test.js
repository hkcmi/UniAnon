import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  decideAppealResolution,
  decideCaseResolution,
  voteWeightTotal
} from '../src/governance-decision-service.js';

test('totals weighted votes by decision', () => {
  assert.equal(voteWeightTotal([
    { decision: 'approve', weight: 2 },
    { decision: 'dismiss', weight: 3 },
    { decision: 'approve', weight: 1 }
  ], 'approve'), 3);
});

test('decides appeal resolution from weighted votes', () => {
  assert.deepEqual(decideAppealResolution({
    target_type: 'user',
    votes: [{ decision: 'approve', weight: 3 }]
  }, { juryApprovalWeight: 3 }), {
    resolved: true,
    decision: 'approve',
    action: 'restore_access',
    reason: 'appeal jury approved the appeal'
  });

  assert.deepEqual(decideAppealResolution({
    target_type: 'post',
    votes: [{ decision: 'dismiss', weight: 3 }]
  }, { juryApprovalWeight: 3 }), {
    resolved: true,
    decision: 'dismiss',
    action: 'none',
    reason: 'appeal jury dismissed the appeal'
  });

  assert.deepEqual(decideAppealResolution({
    target_type: 'post',
    votes: [{ decision: 'approve', weight: 2 }]
  }, { juryApprovalWeight: 3 }), { resolved: false });
});

test('decides moderation case resolution from weighted votes', () => {
  assert.deepEqual(decideCaseResolution({
    votes: [{ decision: 'violation', action: 'ban_user', weight: 4 }]
  }, { juryApprovalWeight: 3, approvalThreshold: 4 }), {
    resolved: true,
    decision: 'violation',
    action: 'ban_user',
    reason: 'jury approved ban_user'
  });

  assert.deepEqual(decideCaseResolution({
    votes: [{ decision: 'dismiss', weight: 3 }]
  }, { juryApprovalWeight: 3, approvalThreshold: 4 }), {
    resolved: true,
    decision: 'dismiss',
    action: 'none',
    reason: 'jury dismissed the case'
  });

  assert.deepEqual(decideCaseResolution({
    votes: [{ decision: 'violation', action: 'hide_content', weight: 2 }]
  }, { juryApprovalWeight: 3, approvalThreshold: 4 }), { resolved: false });
});
