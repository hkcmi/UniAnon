export function voteWeightTotal(votes, decision) {
  return votes
    .filter((vote) => vote.decision === decision)
    .reduce((sum, vote) => sum + vote.weight, 0);
}

export function decideAppealResolution(appealCase, options = {}) {
  const juryApprovalWeight = options.juryApprovalWeight;
  const approveWeight = voteWeightTotal(appealCase.votes, 'approve');
  const dismissWeight = voteWeightTotal(appealCase.votes, 'dismiss');

  if (dismissWeight >= juryApprovalWeight) {
    return {
      resolved: true,
      decision: 'dismiss',
      action: 'none',
      reason: 'appeal jury dismissed the appeal'
    };
  }

  if (approveWeight < juryApprovalWeight) {
    return { resolved: false };
  }

  return {
    resolved: true,
    decision: 'approve',
    action: appealCase.target_type === 'user' ? 'restore_access' : 'restore_content',
    reason: 'appeal jury approved the appeal'
  };
}

export function decideCaseResolution(moderationCase, options = {}) {
  const juryApprovalWeight = options.juryApprovalWeight;
  const approvalThreshold = options.approvalThreshold;
  const violationVotes = moderationCase.votes.filter((vote) => vote.decision === 'violation');
  const dismissWeight = voteWeightTotal(moderationCase.votes, 'dismiss');
  const violationWeight = violationVotes.reduce((sum, vote) => sum + vote.weight, 0);

  if (dismissWeight >= juryApprovalWeight) {
    return {
      resolved: true,
      decision: 'dismiss',
      action: 'none',
      reason: 'jury dismissed the case'
    };
  }

  if (violationWeight < approvalThreshold) {
    return { resolved: false };
  }

  const action = violationVotes.at(-1)?.action || 'hide_content';
  return {
    resolved: true,
    decision: 'violation',
    action,
    reason: `jury approved ${action}`
  };
}
