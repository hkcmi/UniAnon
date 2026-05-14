import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApprovalService } from '../src/approval-service.js';

function fakeStore() {
  const requests = new Map();
  return {
    requests,
    findOpenApprovalRequest(operation, payload) {
      return [...requests.values()].find((request) => {
        return request.operation === operation
          && request.status === 'open'
          && JSON.stringify(request.payload) === JSON.stringify(payload);
      }) || null;
    },
    createApprovalRequest(operation, payload, actorHash) {
      const request = {
        id: `request-${requests.size + 1}`,
        operation,
        payload,
        approvals: [actorHash],
        status: 'open',
        created_by: actorHash
      };
      requests.set(request.id, request);
      return request;
    },
    approveRequest(requestId, actorHash) {
      const request = requests.get(requestId);
      if (!request.approvals.includes(actorHash)) {
        request.approvals.push(actorHash);
      }
      return request;
    }
  };
}

test('creates a pending high-impact approval request', () => {
  const store = fakeStore();
  const service = createApprovalService(store, { requiredApprovals: 2 });
  const result = service.requestOrApprove('create_space', { name: 'Private' }, 'actor-a');

  assert.equal(result.ok, true);
  assert.equal(result.approved, false);
  assert.deepEqual(result.approvalRequest.approvals, ['actor-a']);
});

test('blocks single actor self-approval before another approver participates', () => {
  const store = fakeStore();
  const service = createApprovalService(store, { requiredApprovals: 2 });
  service.requestOrApprove('change_role', { user_hash: 'target', role: 'moderator' }, 'actor-a');

  const result = service.requestOrApprove('change_role', { user_hash: 'target', role: 'moderator' }, 'actor-a');

  assert.equal(result.ok, false);
  assert.equal(result.error, 'own_approval_not_sufficient');
  assert.deepEqual(result.approvalRequest.approvals, ['actor-a']);
});

test('marks request approved when required distinct approvals are present', () => {
  const store = fakeStore();
  const service = createApprovalService(store, { requiredApprovals: 2 });
  service.requestOrApprove('change_role', { user_hash: 'target', role: 'moderator' }, 'actor-a');

  const result = service.requestOrApprove('change_role', { user_hash: 'target', role: 'moderator' }, 'actor-b');

  assert.equal(result.ok, true);
  assert.equal(result.approved, true);
  assert.deepEqual(result.approvalRequest.approvals, ['actor-a', 'actor-b']);
});
