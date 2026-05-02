# UniAnon Incident Response And Secret Rotation Runbook

This runbook is for production or privacy-sensitive UniAnon deployments.

Incidents must be handled with two goals at the same time:

- Protect users from identity linkage and retaliation.
- Preserve enough evidence to understand and fix the failure.

## Incident Severity

Use the highest matching severity.

### Severity 1: Privacy-Critical

Examples:

- Plaintext email appears in the community database, public API, frontend, logs, exports, or backups.
- `AUTH_SUBJECT_SECRET`, `NULLIFIER_SECRET`, or production database backups are exposed.
- An attacker can link posts, reports, votes, or moderation actions to real email addresses.
- Public audit output exposes raw `user_hash`, nullifier, email, tokens, or identity-provider subject values.

Immediate action: pause public service or block affected endpoints until containment is complete.

### Severity 2: Security-Critical

Examples:

- `MEMBERSHIP_ASSERTION_SECRET`, `SERVER_SECRET`, session tokens, OIDC client secret, SMTP password, or Redis endpoint are exposed.
- Unauthorized moderator/admin access is suspected.
- Production server or deployment host is compromised.
- Backups are copied by an unauthorized party.

Immediate action: isolate the system, preserve evidence, rotate affected credentials, and force re-login where needed.

### Severity 3: Operational

Examples:

- Failed deploy, unhealthy app, broken email delivery, OIDC outage, Redis outage, or corrupted local database.
- Rate limits are misconfigured.
- Reverse proxy or TLS configuration fails.

Immediate action: restore service safely without weakening privacy controls.

## First 15 Minutes

1. Assign an incident lead and one recorder.
2. Record the time, reporter, symptoms, current Git commit, deployment host, and auth mode.
3. Stop non-essential deploys and configuration changes.
4. Preserve the current database and relevant logs in an access-controlled location.
5. If active privacy leakage is possible, put the app behind maintenance mode or stop the app process.
6. Do not post raw logs, tokens, database rows, emails, or user hashes into chat tools.
7. Decide whether sessions must be invalidated immediately.

Stop the app locally:

```bash
pkill -f "node src/server.js"
```

Stop Docker app container only:

```bash
docker compose stop app
```

## Evidence Preservation

Preserve evidence before destructive cleanup.

- Current SQLite database and sidecar files.
- Deployment `.env` or secret-manager version identifiers.
- Reverse proxy config.
- App logs and proxy logs with restricted access.
- Git commit and local diff, if any.
- `schema_migrations` output.
- Timestamped description of what was visible to users.

Suggested evidence commands:

```bash
mkdir -p incident-evidence
cp data/unianon.sqlite* incident-evidence/
git rev-parse HEAD > incident-evidence/git-commit.txt
git status --short > incident-evidence/git-status.txt
```

For Docker:

```bash
mkdir -p incident-evidence
docker compose logs app > incident-evidence/app.log
docker compose logs redis > incident-evidence/redis.log
```

Treat `incident-evidence/` as sensitive. Do not commit it.

## Force Re-Login

If session tokens, browsers, local storage, logs, or a host are suspected to be compromised, delete all sessions.

SQLite:

```sql
DELETE FROM sessions;
```

Npm local:

```bash
sqlite3 data/unianon.sqlite 'DELETE FROM sessions;'
```

Docker:

```bash
docker compose stop app
docker compose run --rm --no-deps app sh -c "node -e \"const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync('/app/data/unianon.sqlite'); db.exec('DELETE FROM sessions'); db.close();\""
docker compose start app
```

## Secret Rotation Matrix

Rotate only after deciding the continuity tradeoff. Some secrets can be rotated cleanly; others intentionally change identity semantics.

| Secret | Rotate When | Effect | Required Follow-up |
| --- | --- | --- | --- |
| `SERVER_SECRET` | Server HMAC use is exposed. | Public audit refs may change. | Restart app; review audit reference expectations. |
| `AUTH_SUBJECT_SECRET` | Email-to-subject derivation may be exposed. | Magic-link users may receive new `user_hash` values. | Plan account continuity loss; communicate before rotation. |
| `AUTH_LOG_SECRET` | Auth event digests may be exposed. | New email digests no longer match old auth events. | Accept split auth history or archive old events. |
| `NULLIFIER_SECRET` | Nullifier derivation may be exposed. | Duplicate prevention and ban persistence can break for future logins. | Plan migration or re-verification strategy. |
| `MEMBERSHIP_ASSERTION_SECRET` | Assertion signing key may be exposed. | Old assertions become untrusted after rotation. | Rotate immediately; restart app; force re-login if needed. |
| `OIDC_CLIENT_SECRET` | OIDC client credentials exposed. | Attacker may abuse client registration. | Rotate in IdP and deployment secret store. |
| `SMTP_PASS` | SMTP credentials exposed. | Attacker may send mail as UniAnon. | Rotate at SMTP provider; review mail logs. |
| `REDIS_URL` / Redis credentials | Redis exposed. | Rate-limit counters may be read or changed. | Rotate credentials or isolate Redis; restart app. |

Generate replacement secrets:

```bash
openssl rand -base64 48
```

## Rotation Procedure

1. Identify exactly which secrets are affected.
2. Decide whether identity continuity must be preserved.
3. Create a fresh encrypted backup before rotating.
4. Update secret manager or production `.env`.
5. Restart the app.
6. Force re-login if sessions or signing material are affected.
7. Run `/health`.
8. Perform one login in the selected auth mode.
9. Confirm posting, reporting, audit log, and moderation still work.
10. Record rotated secrets by name only, never by value.

Npm restart:

```bash
npm run dev
```

Docker restart:

```bash
docker compose up -d
docker compose logs app
```

## Incident Playbooks

### Plaintext Email Appears In Community Storage

1. Treat as Severity 1.
2. Stop the app or block affected endpoints.
3. Preserve database and logs.
4. Identify source: request body, auth flow, logging, migration, import, or external script.
5. Patch code to prevent future writes.
6. Remove plaintext email from production database only after evidence is preserved.
7. Audit backups that may contain the plaintext.
8. Decide user notification requirements.
9. Add a regression test.

Database checks:

```sql
PRAGMA table_info(users);
PRAGMA table_info(magic_tokens);
PRAGMA table_info(auth_events);
```

### Membership Assertion Signing Key Exposed

1. Rotate `MEMBERSHIP_ASSERTION_SECRET`.
2. Restart the app.
3. Force re-login if there is any chance sessions were also exposed.
4. Confirm `/auth/exchange` rejects old assertions.
5. Review logs for suspicious assertion use.

### Session Tokens Exposed

1. Delete all sessions.
2. Restart app.
3. Confirm `/me` rejects old bearer tokens.
4. Review proxy/app logs for token leakage source.
5. Patch logging or frontend behavior if needed.

### OIDC Client Secret Exposed

1. Rotate the client secret in the identity provider.
2. Update `OIDC_CLIENT_SECRET`.
3. Restart app.
4. Confirm OIDC login works.
5. Review IdP logs for suspicious authorization-code exchanges.

### SMTP Credentials Exposed

1. Disable or rotate SMTP credentials at the provider.
2. Update `SMTP_PASS`.
3. Review SMTP logs for unexpected sends.
4. Confirm magic-link delivery still works.
5. Consider moving to minimal-claims OIDC for higher privacy.

### Database Backup Exposed

1. Treat as Severity 1 if backup contains production user activity.
2. Identify whether matching secrets were also exposed.
3. If secrets were exposed, follow relevant secret rotation procedures.
4. Assume pseudonymous community activity may be visible to the recipient.
5. Review backup storage, retention, and access controls.
6. Notify stakeholders according to legal and community commitments.

## Communication Rules

- Do not include raw emails, tokens, assertions, nullifiers, or full user hashes in incident updates.
- Use short internal incident IDs.
- Share detailed evidence only through access-controlled storage.
- Separate technical facts from speculation.
- Record privacy tradeoffs explicitly.

## Closure Checklist

- [ ] Root cause is documented.
- [ ] Evidence is preserved in restricted storage.
- [ ] Affected secrets are rotated or explicitly accepted as safe.
- [ ] Sessions are invalidated if needed.
- [ ] Regression test or checklist item is added.
- [ ] Production privacy checklist is re-run.
- [ ] Backup/restore implications are reviewed.
- [ ] User/community communication decision is recorded.
- [ ] Incident timeline is complete.

## Incident Record Template

- Incident ID:
- Severity:
- Start time:
- Detection source:
- Git commit:
- Auth mode:
- Affected data:
- Affected secrets:
- Actions taken:
- Sessions invalidated:
- Secrets rotated:
- User impact:
- Privacy tradeoffs:
- Follow-up tasks:
- Closure time:
