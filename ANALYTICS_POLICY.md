# UniAnon Privacy-Preserving Analytics Policy

UniAnon treats analytics as a privacy risk by default. The product goal is to understand whether an instance is healthy without creating another way to link posts, comments, reports, votes, or logins to a real person.

This policy applies to product analytics, operational metrics, error reporting, observability, and any future telemetry feature.

## Default Position

UniAnon ships with no third-party analytics script, tracking pixel, cross-site cookie, browser fingerprinting, or external telemetry sink.

Any analytics feature must be explicit, documented, disabled by default unless required for local operation, and reviewed against [THREAT_MODEL.md](THREAT_MODEL.md) before release.

## Allowed Metrics

Allowed metrics are aggregate, low-cardinality, and operationally useful:

- Total active accounts per day or week.
- Total posts, comments, reports, governance cases, appeals, and votes per day.
- Rate-limit block counts by limiter name.
- Error counts by route family and status code.
- Queue or mailer delivery success/failure counts without recipient addresses.
- Database migration version and health status.
- Latency histograms by route family, not by user, post, comment, or case id.

Prefer daily buckets. Hourly buckets are allowed only for incident response and should have shorter retention.

## Prohibited Data

Analytics must never collect, store, export, or display:

- Plaintext email addresses.
- Email digests or values derived from email, including `email_digest`.
- Raw `user_hash`, raw nullifier, membership assertion subject, or auth-provider subject.
- Session tokens, token hashes, magic tokens, OIDC codes, ID tokens, or membership assertions.
- Post bodies, comment bodies, report reasons, appeal reasons, or moderation notes.
- IP addresses as analytics dimensions.
- User agent strings as analytics dimensions.
- Unique browser, device, or canvas fingerprints.
- Per-user event timelines.
- Referrer URLs that can contain tokens or private paths.
- Public audit references joined with behavioral analytics.

## Identity And Dimensions

Analytics dimensions must be deliberately coarse:

- Use route families such as `/posts`, `/reports`, or `/governance`, not individual ids.
- Use status-code classes such as `2xx`, `4xx`, or `5xx` when exact codes are not needed.
- Use day-level time buckets by default.
- Use domain-group metrics only when the deployment explicitly accepts that tradeoff and the group has enough members to avoid singling people out.

Never add a dimension that makes it practical to isolate one user, one small group, or one sensitive governance participant.

## Aggregation Rules

Analytics storage should contain aggregates, not raw event streams.

Required aggregation rules:

- Minimum bucket size: do not display or export a bucket with fewer than 10 events unless it is a purely system-level health counter.
- Retention: keep analytics aggregates for no more than 90 days by default.
- Incident mode: if finer metrics are temporarily enabled, document the reason, scope, start time, owner, and deletion date.
- Local-first: prefer local metrics storage controlled by the instance operator over hosted analytics services.

## Third-Party Services

Third-party analytics services are not part of the default UniAnon architecture.

If a deployment adds one anyway, it must be treated as a lower-privacy mode and documented in the production launch record:

- The provider must not receive emails, tokens, identifiers, request bodies, or exact content ids.
- The provider must support short retention and deletion.
- The provider must not use UniAnon data for advertising, profiling, or model training.
- The provider must not set cross-site tracking cookies or fingerprint users.
- The community must be told that a third-party analytics processor is in use.

## Error Reporting And Logs

Error reporting is analytics-adjacent and follows the same policy.

Error payloads must scrub:

- `authorization`
- `cookie`
- `token`
- `code`
- `id_token`
- `membership_assertion`
- request bodies
- query strings that may contain login or OIDC values

Error grouping should use route family, error class, and release version. It must not use user identity, email-derived values, or content ids as grouping keys.

## Implementation Checklist

Before adding any analytics code:

- [ ] Write down the operator question the metric answers.
- [ ] Prove the question cannot be answered by existing logs, health checks, or local admin views.
- [ ] List every field collected.
- [ ] Confirm none of the prohibited data is collected.
- [ ] Confirm the metric is aggregated before storage or export.
- [ ] Define retention and deletion behavior.
- [ ] Add tests or documented verification for redaction.
- [ ] Update [PRODUCTION_PRIVACY_CHECKLIST.md](PRODUCTION_PRIVACY_CHECKLIST.md).

## Launch Checklist

Before enabling analytics for a real community:

- [ ] Analytics is disabled unless the operator intentionally enables it.
- [ ] The active metric list is documented.
- [ ] Retention is configured.
- [ ] Low-count bucket suppression is configured for user/community activity metrics.
- [ ] No third-party analytics service is configured, or the lower-privacy tradeoff is documented.
- [ ] A privacy reviewer has checked a sample export or dashboard for prohibited fields.

## Product Rule

If a metric could help an operator identify who posted, reported, voted, appealed, or logged in, UniAnon must not collect it.

## Current Prototype

The MVP exposes `GET /metrics/summary` for moderators. It returns local day-level aggregate buckets for account creation, posts, comments, reports, governance cases, appeals, and audit events from the last 90 days. Activity buckets below 10 events are suppressed as `1-9`; the endpoint does not return user ids, emails, nullifiers, IP addresses, user agents, tokens, or content text.
