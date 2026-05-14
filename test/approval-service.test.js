import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApprovalService } from '../src/approval-service.js';

function fakeStore() {
  const requests = new Map();
  return {
    requests,
    approvalRequests: requests,
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
        created_by: actorHash,
        created_at: `2026-05-14T00:00:0${requests.size}.000Z`,
        resolved_at: null,
        result: null
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
    },
    resolveApprovalRequest(requestId, result) {
      const request = requests.get(requestId);
      request.status = 'approved';
      request.result = result;
      request.resolved_at = '2026-05-14T00:00:00.000Z';
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

test('lists approval requests with role-change visibility rules', () => {
  const store = fakeStore();
  const service = createApprovalService(store, { requiredApprovals: 2 });
  service.requestOrApprove('create_space', { name: 'Private' }, 'actor-a');
  service.requestOrApprove('change_role', { user_hash: 'target', role: 'moderator', action: 'grant' }, 'actor-a');

  const moderatorView = service.listApprovalRequests({ roles: ['moderator'] });
  const adminView = service.listApprovalRequests({ roles: ['system_admin'] });

  assert.deepEqual(moderatorView.map((request) => request.operation), ['create_space']);
  assert.deepEqual(adminView.map((request) => request.operation).sort(), ['change_role', 'create_space']);
  assert.equal(adminView[0].approvals_count, 1);
  assert.equal(adminView[0].required_approvals, 2);
});

test('resolves approval requests through the service boundary', () => {
  const store = fakeStore();
  const service = createApprovalService(store, { requiredApprovals: 2 });
  const pending = service.requestOrApprove('create_space', { name: 'Private' }, 'actor-a');

  const resolved = service.resolveApprovalRequest(pending.approvalRequest.id, { space_id: 'space-a' });

  assert.equal(resolved.status, 'approved');
  assert.deepEqual(resolved.result, { space_id: 'space-a' });
  assert.equal(resolved.approvals_count, 1);
});
