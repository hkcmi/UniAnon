export function createReportService(store, options = {}) {
  const thresholdForAccused = options.thresholdForAccused || (() => Infinity);

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
    summarizeTargetReports,
    openCaseIfThresholdReached
  };
}
