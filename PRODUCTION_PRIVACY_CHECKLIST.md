# UniAnon Production Privacy Checklist

This checklist must be completed before running UniAnon for a real community, pilot, or privacy-sensitive deployment.

UniAnon's privacy target is not only "do not display email." The production goal is that community content, moderation activity, reports, votes, and audit events cannot be linked back to a user's real email by ordinary operators, moderators, database readers, or routine logs.

## Deployment Gate

Do not launch until every item in this section is complete.

- [ ] `NODE_ENV=production` is set for the app process.
- [ ] `APP_BASE_URL` uses the real HTTPS origin and does not contain `localhost`.
- [ ] TLS terminates at a reverse proxy or managed load balancer.
- [ ] The Node app port is reachable only from the proxy or private network.
- [ ] `TRUST_PROXY` is set only for a trusted proxy hop or subnet.
- [ ] `ALLOWED_DOMAINS` contains only domains approved for this community.
- [ ] Demo seed data has not been loaded into the production database.
- [ ] The production database is a fresh, access-controlled SQLite file or volume.
- [ ] `schema_migrations` exists and shows all expected migrations.
- [ ] `npm test` passes on the exact build being deployed.
- [ ] GitHub CI is passing for the deployed commit.

Check migration status:

```sql
SELECT version, name, applied_at
FROM schema_migrations
ORDER BY version;
```

## Secrets

Use long random values. Do not reuse the same value across secret roles.

- [ ] `SERVER_SECRET` is set, random, and at least 32 characters.
- [ ] `AUTH_SUBJECT_SECRET` is set, random, and at least 32 characters.
- [ ] `AUTH_LOG_SECRET` is set, random, and at least 32 characters.
- [ ] `NULLIFIER_SECRET` is set, random, and at least 32 characters.
- [ ] `MEMBERSHIP_ASSERTION_SECRET` is set, random, and at least 32 characters.
- [ ] All five secrets are distinct.
- [ ] Secrets are stored outside Git, for example in deployment secrets or a protected `.env`.
- [ ] Secrets are included in backup and recovery procedures.
- [ ] [INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md) has been reviewed for secret rotation and forced re-login.
- [ ] The team understands that rotating `AUTH_SUBJECT_SECRET` or `NULLIFIER_SECRET` changes identity/nullifier derivation and can break account continuity or ban persistence.

Generate a secret:

```bash
openssl rand -base64 48
```

## Authentication Mode

Choose one authentication mode deliberately.

### Highest Privacy Mode

For the strongest current privacy posture, prefer OIDC with minimal claims.

- [ ] `OIDC_ISSUER` is configured.
- [ ] `OIDC_CLIENT_ID` is configured.
- [ ] `OIDC_CLIENT_SECRET` is configured if the provider requires it.
- [ ] `OIDC_REDIRECT_URI` exactly matches the production HTTPS callback URL.
- [ ] `OIDC_SCOPES=openid`.
- [ ] `OIDC_SCOPES` does not include `email`, `profile`, `name`, or broad organization scopes unless explicitly accepted.
- [ ] The identity provider releases a verified domain claim such as `hd`, `domain`, or `domain_group`.
- [ ] `OIDC_DOMAIN_CLAIMS` lists only trusted domain-membership claims.
- [ ] The identity provider's audit/log policy has been reviewed.
- [ ] IdP admins understand that releasing email claims weakens UniAnon privacy.

OIDC fallback to `email` is supported only for providers that cannot issue a verified domain-only claim. Treat that fallback as lower privacy.

### Email Magic Link Mode

SMTP mode is acceptable for local pilots or lower-privacy deployments, but not for the highest privacy mode.

- [ ] `EMAIL_DELIVERY=smtp` is set.
- [ ] `EMAIL_DELIVERY=dev` is not used in production.
- [ ] The SMTP provider's recipient-address retention policy has been reviewed.
- [ ] Operators understand that SMTP providers necessarily see recipient email addresses.
- [ ] SMTP access logs are protected and have a retention limit.
- [ ] `EMAIL_FROM` uses a production sender domain.
- [ ] `SMTP_SECURE=true` is used when the provider requires implicit TLS.

## Email And Identity Data

- [ ] Community APIs do not return plaintext email.
- [ ] User records do not contain plaintext email.
- [ ] Magic-token records contain `subject_hash`, `nullifier`, `domain_group`, and `expires_at`, not plaintext email.
- [ ] Auth events contain `email_digest`, domain, result, reason, and timestamp, not plaintext email.
- [ ] Public user APIs do not return nullifiers.
- [ ] Raw `user_hash` and raw nullifier values are not exposed in public audit views.
- [ ] Public audit views use redacted references only.

Suggested database spot checks:

```sql
PRAGMA table_info(users);
PRAGMA table_info(magic_tokens);
PRAGMA table_info(auth_events);
```

## Logging

- [ ] Reverse proxy logs do not record request bodies.
- [ ] Reverse proxy logs do not record sensitive query parameters such as OIDC `code` or magic-link tokens.
- [ ] App logs do not print magic tokens, session tokens, membership assertions, ID tokens, or authorization codes.
- [ ] Error reporting tools, if any, scrub `authorization`, `cookie`, `token`, `code`, `id_token`, and `membership_assertion`.
- [ ] Access logs have an explicit retention period.
- [ ] Moderator/admin audit log access is limited to protected roles.
- [ ] Public audit log is enabled and reviewed for overexposure.

## Sessions And Tokens

- [ ] Sessions are transmitted only over HTTPS.
- [ ] `SESSION_TTL_MS` is set intentionally.
- [ ] `MAGIC_TOKEN_TTL_MS` is short, for example 15 minutes.
- [ ] `OIDC_STATE_TTL_MS` is short, for example 10 minutes.
- [ ] SQLite stores session token hashes, not plaintext session tokens.
- [ ] Backups are protected because they still contain pseudonymous identifiers and audit history.

## Rate Limiting And Abuse Controls

- [ ] `REDIS_URL` is configured for any multi-process or Docker deployment.
- [ ] Magic-link email and IP limits are tuned for the community size.
- [ ] Posting, commenting, report, and jury-vote rate limits are tuned.
- [ ] New-user limits are reviewed before launch.
- [ ] Moderator and trusted-user roles are assigned intentionally.
- [ ] Protected-role sanction thresholds are set intentionally with `ADMIN_PROTECTION_APPROVAL_WEIGHT`.

## Governance And Moderation

- [ ] Community rules define reportable behavior.
- [ ] Jury eligibility is understood and matches the trust-level policy.
- [ ] Direct moderator bans cannot target protected roles.
- [ ] High-impact operations require multi-party approval.
- [ ] Appeal flow has been tested with a banned account.
- [ ] Public audit log has been reviewed for clarity and redaction.
- [ ] Moderators know that they must not request or reveal user emails during disputes.

## Database, Backups, And Access

- [ ] Database file permissions restrict access to the app operator account.
- [ ] Backups are encrypted at rest.
- [ ] Backup retention is documented.
- [ ] Restore has been tested into a non-production environment.
- [ ] [BACKUP_RESTORE.md](BACKUP_RESTORE.md) has been followed for the latest restore drill.
- [ ] Restored database keeps the same secret set when account continuity is required.
- [ ] Database dumps are treated as sensitive, even without plaintext email.
- [ ] External scripts do not mutate the database while the app process is running.

## Browser And Frontend

- [ ] The deployment uses HTTPS.
- [ ] HTTP requests redirect to HTTPS at the proxy.
- [ ] HSTS is enabled after HTTPS is verified.
- [ ] Cookies/local storage/session storage policy has been reviewed.
- [ ] Browser console does not log tokens or identity assertions.
- [ ] Frontend error reporting, if added later, scrubs tokens and assertions.

## Operational Review

Complete these checks before inviting users:

- [ ] Run a test login in the selected auth mode.
- [ ] Create a post and comment.
- [ ] Report content and open a governance case.
- [ ] Vote as a trusted juror.
- [ ] Create and review an appeal.
- [ ] Create a restricted space and complete multi-party approval.
- [ ] Confirm `/audit-log` exposes only redacted references.
- [ ] Confirm `/moderation/audit-log` requires a moderator or system admin session.
- [ ] Confirm banned users cannot receive normal sessions but can open appeals when eligible.

## Known Lower-Privacy Modes

Do not represent these as maximum-privacy deployments:

- Dev magic-link mode, because tokens are returned directly by the API.
- SMTP magic-link mode, because the SMTP provider sees recipient email addresses.
- OIDC with `email` or `profile` scopes, because more identifying data crosses the boundary.
- Shared or reused secrets, because they weaken compartmentalization.
- Unencrypted backups or broad database access, because pseudonymous activity can still be sensitive.

## Final Sign-Off

Record the launch decision:

- Deployment URL:
- Git commit:
- Auth mode:
- Allowed domains:
- Reviewer:
- Date:
- Accepted privacy tradeoffs:
