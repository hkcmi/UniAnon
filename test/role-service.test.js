import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRoleService, normalizeRoleChange, serializeRoleTarget } from '../src/role-service.js';

function user(overrides) {
  return {
    user_hash: 'user-hash',
    nickname: 'user',
    domain_group: 'example.edu',
    trust_level: 1,
    roles: [],
    banned: false,
    created_at: '2026-05-14T00:00:00.000Z',
    ...overrides
  };
}

function fakeStore(users) {
  const userMap = new Map(users.map((record) => [record.user_hash, record]));
  return {
    users: userMap,
    setUserRole(actorHash, targetHash, role, enabled) {
      const target = userMap.get(targetHash);
      const roles = new Set(target.roles);
      if (enabled) {
        roles.add(role);
      } else {
        roles.delete(role);
      }
      target.roles = [...roles].sort();
      return target;
    }
  };
}

test('normalizes supported role changes', () => {
  assert.deepEqual(normalizeRoleChange({
    user_hash: ' target ',
    role: 'moderator',
    action: 'grant'
  }), {
    payload: {
      user_hash: 'target',
      role: 'moderator',
      action: 'grant'
    }
  });

  assert.deepEqual(normalizeRoleChange({ user_hash: 'target', role: 'owner', action: 'grant' }), {
    error: 'invalid_role'
  });
  assert.deepEqual(normalizeRoleChange({ user_hash: 'target', role: 'moderator', action: 'toggle' }), {
    error: 'invalid_role_action'
  });
});

test('serializes role targets with a public ref and no email field', () => {
  const serialized = serializeRoleTarget(user({ user_hash: 'raw-hash', nickname: null, roles: ['moderator'] }));
  const json = JSON.stringify(serialized);

  assert.equal(serialized.nickname, '[unset]');
  assert.equal(serialized.user_ref.length, 12);
  assert.notEqual(serialized.user_ref, 'raw-hash');
  assert.equal(json.includes('email'), false);
});

test('lists role targets oldest first', () => {
  const service = createRoleService(fakeStore([
    user({ user_hash: 'new', created_at: '2026-05-14T01:00:00.000Z' }),
    user({ user_hash: 'old', created_at: '2026-05-14T00:00:00.000Z' })
  ]));

  assert.deepEqual(service.listRoleTargets().map((record) => record.user_hash), ['old', 'new']);
});

test('validates protected role-change edge cases', () => {
  const actor = user({ user_hash: 'admin', roles: ['system_admin'] });
  const target = user({ user_hash: 'target', roles: ['moderator'] });
  const service = createRoleService(fakeStore([actor, target]));

  assert.deepEqual(service.validateRoleChange({
    actor,
    target: null,
    payload: { user_hash: 'missing', role: 'moderator', action: 'grant' }
  }), { ok: false, status: 404, error: 'target_not_found' });

  assert.deepEqual(service.validateRoleChange({
    actor,
    target,
    payload: { user_hash: 'target', role: 'moderator', action: 'grant' }
  }), {
    ok: false,
    status: 409,
    error: 'role_already_granted',
    user: serializeRoleTarget(target)
  });

  assert.deepEqual(service.validateRoleChange({
    actor,
    target,
    payload: { user_hash: 'target', role: 'system_admin', action: 'revoke' }
  }), {
    ok: false,
    status: 409,
    error: 'cannot_remove_last_system_admin'
  });
});

test('applies role changes through the store boundary', () => {
  const actor = user({ user_hash: 'admin', roles: ['system_admin'] });
  const target = user({ user_hash: 'target' });
  const service = createRoleService(fakeStore([actor, target]));

  assert.deepEqual(service.validateRoleChange({
    actor,
    target,
    payload: { user_hash: 'target', role: 'moderator', action: 'grant' }
  }), { ok: true });

  const updated = service.applyRoleChange({
    actor,
    target,
    payload: { user_hash: 'target', role: 'moderator', action: 'grant' }
  });

  assert.equal(updated.roles.includes('moderator'), true);
});
