import { decideAppealResolution, decideCaseResolution } from './governance-decision-service.js';

function hasProtectedRole(user) {
  return Boolean(user?.roles.includes('moderator') || user?.roles.includes('system_admin'));
}

export function createGovernanceResolutionService(store, options = {}) {
  const juryApprovalWeight = options.juryApprovalWeight;
  const adminProtectionApprovalWeight = options.adminProtectionApprovalWeight;

  function caseApprovalThreshold(moderationCase) {
    const accused = store.users.get(moderationCase.accused_hash);
    return hasProtectedRole(accused) ? adminProtectionApprovalWeight : juryApprovalWeight;
  }

  return {
    caseApprovalThreshold,

    maybeResolveAppealCase(appealCase) {
      const resolution = decideAppealResolution(appealCase, {
        juryApprovalWeight
      });
      if (!resolution.resolved) {
        return appealCase;
      }

      if (resolution.action === 'restore_access') {
        store.unbanUser('appeal_jury', appealCase.target_id, resolution.reason);
      } else if (resolution.action === 'restore_content') {
        store.unhideTarget(appealCase.target_type, appealCase.target_id);
      }

      return store.resolveAppealCase(appealCase.id, resolution);
    },

    maybeResolveCase(moderationCase) {
      const resolution = decideCaseResolution(moderationCase, {
        juryApprovalWeight,
        approvalThreshold: caseApprovalThreshold(moderationCase)
      });
      if (!resolution.resolved) {
        return moderationCase;
      }

      if (resolution.action === 'ban_user') {
        store.banUser('jury', moderationCase.accused_hash, resolution.reason);
      } else if (resolution.action === 'hide_content' && moderationCase.target_type !== 'user') {
        store.hideTarget(moderationCase.target_type, moderationCase.target_id);
      }

      return store.resolveCase(moderationCase.id, resolution);
    }
  };
}
