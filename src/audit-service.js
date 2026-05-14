import { publicAuditRef } from './governance-view-service.js';

export function serializePublicAuditEvent(event) {
  return {
    id: event.id,
    operation: event.operation,
    actor_ref: publicAuditRef(event.actor_hash),
    target_ref: publicAuditRef(event.target_hash || event.target_id),
    target_type: event.target_type || null,
    reason: event.reason,
    created_at: event.created_at
  };
}

export function createAuditService(store) {
  return {
    listModeratorAuditEvents() {
      return store.auditLog;
    },

    listPublicAuditEvents() {
      return store.auditLog
        .map(serializePublicAuditEvent)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
    }
  };
}
