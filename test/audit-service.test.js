import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAuditService, serializePublicAuditEvent } from '../src/audit-service.js';

test('serializes public audit events with stable redacted references', () => {
  const event = {
    id: 'audit-a',
    operation: 'ban',
    actor_hash: 'moderator-hash',
    target_hash: 'target-hash',
    target_type: 'user',
    reason: 'rule violation',
    created_at: '2026-05-14T00:00:00.000Z'
  };

  const serialized = serializePublicAuditEvent(event);

  assert.equal(serialized.id, 'audit-a');
  assert.equal(serialized.operation, 'ban');
  assert.equal(serialized.target_type, 'user');
  assert.equal(serialized.reason, 'rule violation');
  assert.equal(serialized.created_at, event.created_at);
  assert.equal(serialized.actor_ref.length, 12);
  assert.equal(serialized.target_ref.length, 12);
  assert.notEqual(serialized.actor_ref, event.actor_hash);
  assert.notEqual(serialized.target_ref, event.target_hash);
});

test('lists public audit events newest first without raw identifiers', () => {
  const service = createAuditService({
    auditLog: [
      {
        id: 'audit-old',
        operation: 'hide',
        actor_hash: 'actor-old',
        target_id: 'post-old',
        target_type: 'post',
        reason: 'old',
        created_at: '2026-05-14T00:00:00.000Z'
      },
      {
        id: 'audit-new',
        operation: 'ban',
        actor_hash: 'actor-new',
        target_hash: 'user-new',
        target_type: 'user',
        reason: 'new',
        created_at: '2026-05-14T01:00:00.000Z'
      }
    ]
  });

  const events = service.listPublicAuditEvents();
  const json = JSON.stringify(events);

  assert.deepEqual(events.map((event) => event.id), ['audit-new', 'audit-old']);
  assert.equal(json.includes('actor-new'), false);
  assert.equal(json.includes('user-new'), false);
  assert.equal(json.includes('post-old'), false);
});

test('lists moderator audit events through the service boundary', () => {
  const auditLog = [{
    id: 'audit-a',
    operation: 'role_granted',
    actor_hash: 'system-admin',
    target_hash: 'target-user',
    created_at: '2026-05-14T00:00:00.000Z'
  }];
  const service = createAuditService({ auditLog });

  assert.equal(service.listModeratorAuditEvents(), auditLog);
});
