import { publicAuditRef } from './governance-view-service.js';

const supportedRoles = new Set(['moderator', 'system_admin']);
const supportedActions = new Set(['grant', 'revoke']);

export function serializeRoleTarget(user) {
  if (!user) {
    return null;
  }

  return {
    user_hash: user.user_hash,
    user_ref: publicAuditRef(user.user_hash),
    nickname: user.nickname || '[unset]',
    domain_group: user.domain_group,
    trust_level: user.trust_level,
    roles: user.roles,
    banned: user.banned
  };
}

export function normalizeRoleChange(body) {
  const targetHash = typeof body.user_hash === 'string' ? body.user_hash.trim() : '';
  const role = typeof body.role === 'string' ? body.role.trim() : '';
  const action = typeof body.action === 'string' ? body.action.trim() : '';

  if (!supportedRoles.has(role)) {
    return { error: 'invalid_role' };
  }

  if (!supportedActions.has(action)) {
    return { error: 'invalid_role_action' };
  }

  return {
    payload: {
      user_hash: targetHash,
      role,
      action
    }
  };
}

function roleChangeReason(payload) {
  return `${payload.action} ${payload.role}`;
}

export function createRoleService(store) {
  function countSystemAdmins() {
    return [...store.users.values()].filter((user) => {
      return !user.banned && user.roles.includes('system_admin');
    }).length;
  }

  return {
    listRoleTargets() {
      return [...store.users.values()]
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map(serializeRoleTarget);
    },

    getUser(userHash) {
      return store.users.get(userHash) || null;
    },

    validateRoleChange({ actor, target, payload }) {
      if (!target) {
        return { ok: false, status: 404, error: 'target_not_found' };
      }

      if (target.user_hash === actor.user_hash && payload.role === 'system_admin' && payload.action === 'revoke') {
        return { ok: false, status: 400, error: 'cannot_revoke_own_system_admin' };
      }

      if (payload.role === 'system_admin' && payload.action === 'revoke' && countSystemAdmins() <= 1) {
        return { ok: false, status: 409, error: 'cannot_remove_last_system_admin' };
      }

      const alreadyHasRole = target.roles.includes(payload.role);
      if (payload.action === 'grant' && alreadyHasRole) {
        return { ok: false, status: 409, error: 'role_already_granted', user: serializeRoleTarget(target) };
      }

      if (payload.action === 'revoke' && !alreadyHasRole) {
        return { ok: false, status: 409, error: 'role_not_granted', user: serializeRoleTarget(target) };
      }

      return { ok: true };
    },

    applyRoleChange({ actor, target, payload }) {
      const updatedUser = store.setUserRole(
        actor.user_hash,
        target.user_hash,
        payload.role,
        payload.action === 'grant',
        roleChangeReason(payload)
      );

      return serializeRoleTarget(updatedUser);
    }
  };
}
