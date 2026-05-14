export function createApprovalService(store, options = {}) {
  const requiredApprovals = options.requiredApprovals;

  function serializeApprovalRequest(request) {
    return {
      id: request.id,
      operation: request.operation,
      payload: request.payload,
      status: request.status,
      approvals_count: request.approvals.length,
      required_approvals: requiredApprovals,
      created_by: request.created_by,
      created_at: request.created_at,
      resolved_at: request.resolved_at,
      result: request.result
    };
  }

  function requestOrApprove(operation, payload, actorHash) {
    const existing = store.findOpenApprovalRequest(operation, payload);
    const approvalRequest = existing || store.createApprovalRequest(operation, payload, actorHash);

    if (existing && existing.created_by === actorHash && !existing.approvals.some((hash) => hash !== actorHash)) {
      return {
        ok: false,
        error: 'own_approval_not_sufficient',
        approvalRequest: existing
      };
    }

    if (existing) {
      store.approveRequest(existing.id, actorHash);
    }

    if (approvalRequest.approvals.length < requiredApprovals) {
      return {
        ok: true,
        approved: false,
        approvalRequest
      };
    }

    return {
      ok: true,
      approved: true,
      approvalRequest
    };
  }

  return {
    requestOrApprove,

    serializeApprovalRequest,

    listApprovalRequests(actor) {
      return [...store.approvalRequests.values()]
        .filter((request) => actor.roles.includes('system_admin') || request.operation !== 'change_role')
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map(serializeApprovalRequest);
    },

    resolveApprovalRequest(requestId, result) {
      const request = store.resolveApprovalRequest(requestId, result);
      return serializeApprovalRequest(request);
    }
  };
}
