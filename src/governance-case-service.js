export function createGovernanceCaseService(store) {
  function listCases() {
    return [...store.moderationCases.values()]
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  function getCase(caseId) {
    return store.moderationCases.get(caseId) || null;
  }

  function addCaseVote({ caseId, user, decision, action, weight }) {
    const moderationCase = getCase(caseId);
    if (!moderationCase) {
      return { ok: false, status: 404, error: 'case_not_found' };
    }

    if (moderationCase.accused_hash === user.user_hash) {
      return { ok: false, status: 400, error: 'cannot_vote_on_own_case' };
    }

    if (moderationCase.juror_hashes.length > 0 && !moderationCase.juror_hashes.includes(user.user_hash)) {
      return { ok: false, status: 403, error: 'juror_not_assigned' };
    }

    const result = store.addCaseVote(
      moderationCase.id,
      user.user_hash,
      decision,
      action,
      weight
    );

    if (!result) {
      return { ok: false, status: 409, error: 'case_not_open' };
    }

    if (result.duplicate) {
      return { ok: false, status: 409, error: 'duplicate_vote' };
    }

    return { ok: true, moderationCase: result.moderationCase };
  }

  function createAppeal({ appellant, targetType, targetId, reason }) {
    const existing = store.findOpenAppealCase(appellant.user_hash, targetType, targetId);
    if (existing) {
      return {
        ok: false,
        status: 409,
        error: 'duplicate_appeal',
        appealId: existing.id
      };
    }

    return {
      ok: true,
      appealCase: store.createAppealCase(appellant.user_hash, targetType, targetId, reason)
    };
  }

  function listAppeals() {
    return [...store.appealCases.values()]
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  function getAppeal(appealId) {
    return store.appealCases.get(appealId) || null;
  }

  function addAppealVote({ appealId, user, decision, weight }) {
    const appealCase = getAppeal(appealId);
    if (!appealCase) {
      return { ok: false, status: 404, error: 'appeal_not_found' };
    }

    if (appealCase.appellant_hash === user.user_hash) {
      return { ok: false, status: 400, error: 'cannot_vote_on_own_appeal' };
    }

    const result = store.addAppealVote(
      appealCase.id,
      user.user_hash,
      decision,
      weight
    );

    if (!result) {
      return { ok: false, status: 409, error: 'appeal_not_open' };
    }

    if (result.duplicate) {
      return { ok: false, status: 409, error: 'duplicate_vote' };
    }

    return { ok: true, appealCase: result.appealCase };
  }

  return {
    listCases,
    getCase,
    addCaseVote,
    createAppeal,
    listAppeals,
    getAppeal,
    addAppealVote
  };
}
