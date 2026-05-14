export function createApprovalService(store, options = {}) {
  const requiredApprovals = options.requiredApprovals;

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
    requestOrApprove
  };
}
