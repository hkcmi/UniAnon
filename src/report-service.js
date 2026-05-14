export function createReportService(store, options = {}) {
  const thresholdForAccused = options.thresholdForAccused || (() => Infinity);

  function reportWeight(user) {
    if (user.banned || !user.nickname) {
      return 0;
    }

    if (user.trust_level <= 0) {
      return 1;
    }

    return Math.min(3, user.trust_level + 1);
  }

  function reportsForTarget(targetType, targetId) {
    return [...store.reports.values()].filter((candidate) => {
      return candidate.target_type === targetType && candidate.target_id === targetId;
    });
  }

  function summarizeTargetReports(targetType, targetId) {
    const reports = reportsForTarget(targetType, targetId);
    return {
      reports,
      reportIds: reports.map((report) => report.id),
      reportWeight: reports.reduce((sum, report) => sum + report.weight, 0)
    };
  }

  function openCaseIfThresholdReached(targetType, targetId, accusedHash) {
    const summary = summarizeTargetReports(targetType, targetId);
    const reportThreshold = thresholdForAccused(accusedHash);
    const existingCase = store.findOpenCase(targetType, targetId);

    if (existingCase || summary.reportWeight < reportThreshold) {
      return {
        moderationCase: existingCase || null,
        reportWeight: summary.reportWeight,
        reportThreshold
      };
    }

    return {
      moderationCase: store.createModerationCase(targetType, targetId, accusedHash, summary.reportIds),
      reportWeight: summary.reportWeight,
      reportThreshold
    };
  }

  return {
    reportsForTarget,
    reportWeight,
    summarizeTargetReports,
    openCaseIfThresholdReached,

    submitReport({ actor, targetType, targetId, reason, accusedHash }) {
      const { report, duplicate } = store.createReport(
        actor.user_hash,
        targetType,
        targetId,
        reason,
        reportWeight(actor)
      );

      if (duplicate) {
        return { ok: false, status: 409, error: 'duplicate_report', report };
      }

      const reportSummary = openCaseIfThresholdReached(targetType, targetId, accusedHash);
      return { ok: true, report, reportSummary };
    }
  };
}
