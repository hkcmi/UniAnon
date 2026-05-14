function dayKey(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function incrementMetricBucket(buckets, createdAt, name, cutoffMs) {
  const createdMs = new Date(createdAt).getTime();
  if (!Number.isFinite(createdMs) || createdMs < cutoffMs) {
    return;
  }

  const key = dayKey(createdAt);
  const bucket = buckets.get(key) || {
    date: key,
    accounts_created: 0,
    posts_created: 0,
    comments_created: 0,
    reports_created: 0,
    cases_opened: 0,
    appeals_opened: 0,
    audit_events: 0
  };
  bucket[name] += 1;
  buckets.set(key, bucket);
}

export function privacyCount(value) {
  if (value === 0 || value >= 10) {
    return { count: value, suppressed: false };
  }

  return { count: null, suppressed: true, range: '1-9' };
}

function serializeMetricsBucket(bucket) {
  return {
    date: bucket.date,
    accounts_created: privacyCount(bucket.accounts_created),
    posts_created: privacyCount(bucket.posts_created),
    comments_created: privacyCount(bucket.comments_created),
    reports_created: privacyCount(bucket.reports_created),
    cases_opened: privacyCount(bucket.cases_opened),
    appeals_opened: privacyCount(bucket.appeals_opened),
    audit_events: privacyCount(bucket.audit_events)
  };
}

export function buildMetricsSummary(store, options = {}) {
  const buckets = new Map();
  const retentionDays = options.retentionDays || 90;
  const now = options.now || Date.now();
  const cutoffMs = now - (retentionDays * 24 * 60 * 60 * 1000);

  for (const user of store.users.values()) {
    incrementMetricBucket(buckets, user.created_at, 'accounts_created', cutoffMs);
  }
  for (const post of store.posts.values()) {
    incrementMetricBucket(buckets, post.created_at, 'posts_created', cutoffMs);
  }
  for (const comment of store.comments.values()) {
    incrementMetricBucket(buckets, comment.created_at, 'comments_created', cutoffMs);
  }
  for (const report of store.reports.values()) {
    incrementMetricBucket(buckets, report.created_at, 'reports_created', cutoffMs);
  }
  for (const moderationCase of store.moderationCases.values()) {
    incrementMetricBucket(buckets, moderationCase.created_at, 'cases_opened', cutoffMs);
  }
  for (const appealCase of store.appealCases.values()) {
    incrementMetricBucket(buckets, appealCase.created_at, 'appeals_opened', cutoffMs);
  }
  for (const event of store.auditLog) {
    incrementMetricBucket(buckets, event.created_at, 'audit_events', cutoffMs);
  }

  return {
    generated_at: new Date(now).toISOString(),
    retention_days: retentionDays,
    min_activity_bucket_size: 10,
    buckets: [...buckets.values()]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, retentionDays)
      .map(serializeMetricsBucket)
  };
}
