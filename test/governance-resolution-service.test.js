import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGovernanceResolutionService } from '../src/governance-resolution-service.js';

function fakeStore() {
  return {
    users: new Map([
      ['member', { user_hash: 'member', roles: [] }],
      ['admin', { user_hash: 'admin', roles: ['system_admin'] }]
    ]),
    actions: [],
    banUser(actorHash, targetHash, reason) {
      this.actions.push({ operation: 'ban', actorHash, targetHash, reason });
      return true;
    },
    hideTarget(targetType, targetId) {
      this.actions.push({ operation: 'hide', targetType, targetId });
      return true;
    },
    unbanUser(actorHash, targetHash, reason) {
      this.actions.push({ operation: 'unban', actorHash, targetHash, reason });
      return true;
    },
    unhideTarget(targetType, targetId) {
      this.actions.push({ operation: 'unhide', targetType, targetId });
      return true;
    },
    resolveCase(caseId, resolution) {
      return { id: caseId, status: 'resolved', resolution };
    },
    resolveAppealCase(appealId, resolution) {
      return { id: appealId, status: 'resolved', resolution };
    }
  };
}

test('uses higher approval threshold for protected accused users', () => {
  const service = createGovernanceResolutionService(fakeStore(), {
    juryApprovalWeight: 3,
    adminProtectionApprovalWeight: 8
  });

  assert.equal(service.caseApprovalThreshold({ accused_hash: 'member' }), 3);
  assert.equal(service.caseApprovalThreshold({ accused_hash: 'admin' }), 8);
});

test('resolves moderation cases and applies selected sanctions', () => {
  const store = fakeStore();
  const service = createGovernanceResolutionService(store, {
    juryApprovalWeight: 3,
    adminProtectionApprovalWeight: 8
  });

  const pending = {
    id: 'case-pending',
    accused_hash: 'member',
    target_type: 'post',
    target_id: 'post-a',
    votes: [{ decision: 'violation', action: 'hide_content', weight: 1 }]
  };
  const resolved = service.maybeResolveCase({
    ...pending,
    id: 'case-resolved',
    votes: [{ decision: 'violation', action: 'hide_content', weight: 3 }]
  });

  assert.equal(service.maybeResolveCase(pending), pending);
  assert.equal(resolved.status, 'resolved');
  assert.deepEqual(store.actions[0], {
    operation: 'hide',
    targetType: 'post',
    targetId: 'post-a'
  });
});

test('resolves user appeals and restores access', () => {
  const store = fakeStore();
  const service = createGovernanceResolutionService(store, {
    juryApprovalWeight: 3,
    adminProtectionApprovalWeight: 8
  });

  const resolved = service.maybeResolveAppealCase({
    id: 'appeal-a',
    target_type: 'user',
    target_id: 'member',
    votes: [{ decision: 'approve', weight: 3 }]
  });

  assert.equal(resolved.status, 'resolved');
  assert.deepEqual(store.actions[0], {
    operation: 'unban',
    actorHash: 'appeal_jury',
    targetHash: 'member',
    reason: 'appeal jury approved the appeal'
  });
});
