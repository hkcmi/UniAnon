import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createModerationActionService } from '../src/moderation-action-service.js';

function user(overrides) {
  return {
    user_hash: 'target',
    roles: [],
    banned: false,
    ...overrides
  };
}

function fakeStore(users) {
  const userMap = new Map(users.map((record) => [record.user_hash, record]));
  return {
    users: userMap,
    bans: [],
    banUser(actorHash, targetHash, reason) {
      const target = userMap.get(targetHash);
      if (!target) {
        return false;
      }
      target.banned = true;
      this.bans.push({ actorHash, targetHash, reason });
      return true;
    }
  };
}

test('directly bans ordinary users through the store boundary', () => {
  const actor = user({ user_hash: 'moderator', roles: ['moderator'] });
  const target = user({ user_hash: 'target' });
  const store = fakeStore([actor, target]);
  const service = createModerationActionService(store, { protectedUserApprovalWeight: 8 });

  assert.deepEqual(service.directBan({
    actor,
    targetHash: 'target',
    reason: 'rule violation'
  }), { ok: true });
  assert.equal(target.banned, true);
  assert.deepEqual(store.bans[0], {
    actorHash: 'moderator',
    targetHash: 'target',
    reason: 'rule violation'
  });
});

test('rejects direct bans for missing, self, already-banned, and protected users', () => {
  const actor = user({ user_hash: 'moderator', roles: ['moderator'] });
  const banned = user({ user_hash: 'banned', banned: true });
  const protectedUser = user({ user_hash: 'admin', roles: ['system_admin'] });
  const service = createModerationActionService(fakeStore([actor, banned, protectedUser]), {
    protectedUserApprovalWeight: 8
  });

  assert.deepEqual(service.directBan({ actor, targetHash: 'missing', reason: 'x' }), {
    ok: false,
    status: 404,
    error: 'target_not_found'
  });
  assert.deepEqual(service.directBan({ actor, targetHash: 'moderator', reason: 'x' }), {
    ok: false,
    status: 400,
    error: 'cannot_ban_self'
  });
  assert.deepEqual(service.directBan({ actor, targetHash: 'banned', reason: 'x' }), {
    ok: false,
    status: 409,
    error: 'target_already_banned'
  });
  assert.deepEqual(service.directBan({ actor, targetHash: 'admin', reason: 'x' }), {
    ok: false,
    status: 403,
    error: 'protected_user_requires_governance',
    required_approval_weight: 8
  });
});
