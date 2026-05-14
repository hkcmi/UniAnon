function hasProtectedRole(user) {
  return Boolean(user?.roles.includes('moderator') || user?.roles.includes('system_admin'));
}

export function createModerationActionService(store, options = {}) {
  const protectedUserApprovalWeight = options.protectedUserApprovalWeight;

  return {
    directBan({ actor, targetHash, reason }) {
      const target = store.users.get(targetHash);
      if (!target) {
        return { ok: false, status: 404, error: 'target_not_found' };
      }

      if (target.user_hash === actor.user_hash) {
        return { ok: false, status: 400, error: 'cannot_ban_self' };
      }

      if (target.banned) {
        return { ok: false, status: 409, error: 'target_already_banned' };
      }

      if (hasProtectedRole(target)) {
        return {
          ok: false,
          status: 403,
          error: 'protected_user_requires_governance',
          required_approval_weight: protectedUserApprovalWeight
        };
      }

      const ok = store.banUser(actor.user_hash, targetHash, reason);
      if (!ok) {
        return { ok: false, status: 404, error: 'target_not_found' };
      }

      return { ok: true };
    }
  };
}
