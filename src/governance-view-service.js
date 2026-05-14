import crypto from 'node:crypto';
import { config } from './config.js';

export function publicAuditRef(value, secret = config.serverSecret) {
  if (!value) {
    return null;
  }

  return crypto
    .createHmac('sha256', secret)
    .update(`audit:${value}`)
    .digest('hex')
    .slice(0, 12);
}

export function excerpt(value, limit = 180) {
  if (typeof value !== 'string') {
    return '';
  }

  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > limit ? `${normalized.slice(0, limit - 1)}...` : normalized;
}

export function createGovernanceViewService(store, options = {}) {
  const auditSecret = options.auditSecret || config.serverSecret;
  const approvalThresholdForCase = options.approvalThresholdForCase || (() => null);

  function auditRef(value) {
    return publicAuditRef(value, auditSecret);
  }

  function serializeEvidenceUser(userHash) {
    const user = store.users.get(userHash);
    if (!user) {
      return null;
    }

    return {
      user_ref: auditRef(user.user_hash),
      nickname: user.nickname || '[unset]',
      domain_group: user.domain_group,
      trust_level: user.trust_level,
      roles: user.roles,
      banned: user.banned
    };
  }

  function serializeTargetEvidence(targetType, targetId) {
    if (targetType === 'post') {
      const post = store.posts.get(targetId);
      const author = post ? store.users.get(post.user_hash) : null;
      return post ? {
        type: 'post',
        id: post.id,
        author_ref: auditRef(post.user_hash),
        author_nickname: author?.nickname || '[deleted]',
        content_excerpt: excerpt(post.content),
        hidden: post.hidden,
        created_at: post.created_at
      } : null;
    }

    if (targetType === 'comment') {
      const comment = store.comments.get(targetId);
      const author = comment ? store.users.get(comment.user_hash) : null;
      return comment ? {
        type: 'comment',
        id: comment.id,
        post_id: comment.post_id,
        author_ref: auditRef(comment.user_hash),
        author_nickname: author?.nickname || '[deleted]',
        content_excerpt: excerpt(comment.content),
        hidden: comment.hidden,
        created_at: comment.created_at
      } : null;
    }

    if (targetType === 'user') {
      return {
        type: 'user',
        id: auditRef(targetId),
        user: serializeEvidenceUser(targetId)
      };
    }

    return null;
  }

  function serializeCase(moderationCase) {
    const reports = moderationCase.report_ids.map((reportId) => store.reports.get(reportId)).filter(Boolean);
    const violationWeight = moderationCase.votes
      .filter((vote) => vote.decision === 'violation')
      .reduce((sum, vote) => sum + vote.weight, 0);
    const dismissWeight = moderationCase.votes
      .filter((vote) => vote.decision === 'dismiss')
      .reduce((sum, vote) => sum + vote.weight, 0);

    return {
      id: moderationCase.id,
      target_type: moderationCase.target_type,
      target_id: moderationCase.target_id,
      accused_hash: moderationCase.accused_hash,
      status: moderationCase.status,
      report_count: reports.length,
      report_weight: reports.reduce((sum, report) => sum + report.weight, 0),
      juror_count: moderationCase.juror_hashes?.length || 0,
      approval_threshold: approvalThresholdForCase(moderationCase),
      target: serializeTargetEvidence(moderationCase.target_type, moderationCase.target_id),
      accused: serializeEvidenceUser(moderationCase.accused_hash),
      reports: reports.map((report) => ({
        id: report.id,
        actor_ref: auditRef(report.actor_hash),
        reason: report.reason,
        weight: report.weight,
        created_at: report.created_at
      })),
      jurors: (moderationCase.juror_hashes || []).map((jurorHash) => ({
        user_ref: auditRef(jurorHash)
      })),
      votes: moderationCase.votes.map((vote) => ({
        actor_ref: auditRef(vote.voter_hash),
        decision: vote.decision,
        action: vote.action,
        weight: vote.weight,
        created_at: vote.created_at
      })),
      violation_weight: violationWeight,
      dismiss_weight: dismissWeight,
      created_at: moderationCase.created_at,
      resolved_at: moderationCase.resolved_at,
      resolution: moderationCase.resolution
    };
  }

  function serializeAppealCase(appealCase) {
    const approveWeight = appealCase.votes
      .filter((vote) => vote.decision === 'approve')
      .reduce((sum, vote) => sum + vote.weight, 0);
    const dismissWeight = appealCase.votes
      .filter((vote) => vote.decision === 'dismiss')
      .reduce((sum, vote) => sum + vote.weight, 0);

    return {
      id: appealCase.id,
      appellant_hash: appealCase.appellant_hash,
      target_type: appealCase.target_type,
      target_id: appealCase.target_id,
      reason: appealCase.reason,
      status: appealCase.status,
      appellant: serializeEvidenceUser(appealCase.appellant_hash),
      target: serializeTargetEvidence(appealCase.target_type, appealCase.target_id),
      votes: appealCase.votes.map((vote) => ({
        actor_ref: auditRef(vote.voter_hash),
        decision: vote.decision,
        weight: vote.weight,
        created_at: vote.created_at
      })),
      approve_weight: approveWeight,
      dismiss_weight: dismissWeight,
      created_at: appealCase.created_at,
      resolved_at: appealCase.resolved_at,
      resolution: appealCase.resolution
    };
  }

  return {
    auditRef,
    serializeEvidenceUser,
    serializeTargetEvidence,
    serializeCase,
    serializeAppealCase
  };
}
