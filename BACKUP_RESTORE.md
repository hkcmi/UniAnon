# UniAnon Backup And Restore Guide

This guide covers the current SQLite-based UniAnon MVP. Backups are sensitive even though UniAnon avoids plaintext email in community records. They contain pseudonymous user hashes, nullifiers, audit history, reports, moderation decisions, posts, comments, and trust data.

## What Must Be Backed Up

Back up these items together:

- SQLite database file: `DATABASE_PATH`, usually `data/unianon.sqlite`.
- SQLite sidecar files when present: `*.sqlite-wal` and `*.sqlite-shm`.
- Production environment secrets:
  - `SERVER_SECRET`
  - `AUTH_SUBJECT_SECRET`
  - `AUTH_LOG_SECRET`
  - `NULLIFIER_SECRET`
  - `MEMBERSHIP_ASSERTION_SECRET`
  - OIDC and SMTP secrets, if configured.
- Deployment configuration:
  - `COMMUNITY_ID`
  - `ALLOWED_DOMAINS`
  - `APP_BASE_URL`
  - auth mode settings.
- The Git commit or release tag running at the time of backup.

Do not commit backups, `.env` files, SQLite files, or exported secrets to Git.

## Why Secrets Matter

Database restores require compatible secrets when account continuity matters.

- `AUTH_SUBJECT_SECRET` controls stable subject derivation for magic-link users.
- `NULLIFIER_SECRET` controls community-scoped nullifiers for duplicate prevention and ban persistence.
- `MEMBERSHIP_ASSERTION_SECRET` verifies signed membership assertions.
- `AUTH_LOG_SECRET` controls auth-event email digests.
- `SERVER_SECRET` is used for server-side HMAC operations such as public audit references.

Restoring only the database without the correct secrets can cause identity discontinuity, failed assertion checks, changed audit references, or broken ban persistence.

## Backup Privacy Rules

- Encrypt backups at rest.
- Limit backup access to the smallest possible operator group.
- Keep a retention schedule and delete expired backups.
- Treat database dumps as sensitive even without plaintext email.
- Do not send backups through personal email or consumer chat tools.
- Do not restore production data into shared development machines.
- If a backup is used for debugging, use a private environment and delete it afterward.

## Npm Local Backup

Stop the app before copying the SQLite file. UniAnon loads records into memory and writes changes during API operations, so a stopped-process copy is simplest and safest.

```bash
mkdir -p backups
npm test
cp data/unianon.sqlite "backups/unianon-$(date -u +%Y%m%dT%H%M%SZ).sqlite"
```

If SQLite WAL sidecar files exist, copy them as a set:

```bash
cp data/unianon.sqlite* backups/
```

Create an encrypted archive:

```bash
tar -czf - backups/unianon-*.sqlite* .env | openssl enc -aes-256-cbc -salt -pbkdf2 -out backups/unianon-backup.enc
```

Keep the encryption password outside the backup archive.

## Docker Compose Backup

Stop the app container first so SQLite is quiet:

```bash
docker compose stop app
```

Copy the database out of the named volume:

```bash
mkdir -p backups
docker compose run --rm --no-deps app sh -c 'cp /app/data/unianon.sqlite /tmp/unianon.sqlite && cat /tmp/unianon.sqlite' > "backups/unianon-$(date -u +%Y%m%dT%H%M%SZ).sqlite"
```

Restart the app:

```bash
docker compose start app
```

Alternative volume archive:

```bash
docker run --rm \
  -v unianon_unianon-data:/data:ro \
  -v "$PWD/backups:/backup" \
  alpine \
  tar -czf /backup/unianon-data-$(date -u +%Y%m%dT%H%M%SZ).tar.gz -C /data .
```

Encrypt the resulting archive before storing it outside the host.

## Verify A Backup

Never trust a backup until it has been opened in an isolated restore test.

Check database integrity:

```bash
sqlite3 backups/unianon.sqlite 'PRAGMA integrity_check;'
```

Check migration records:

```bash
sqlite3 backups/unianon.sqlite 'SELECT version, name, applied_at FROM schema_migrations ORDER BY version;'
```

Check that plaintext email is not in high-risk community tables:

```bash
sqlite3 backups/unianon.sqlite 'PRAGMA table_info(users);'
sqlite3 backups/unianon.sqlite 'PRAGMA table_info(magic_tokens);'
sqlite3 backups/unianon.sqlite 'PRAGMA table_info(auth_events);'
```

## Npm Local Restore

Stop the app.

Restore the database file:

```bash
cp backups/unianon.sqlite data/unianon.sqlite
```

Restore the matching `.env` or deployment secrets.

Start the app:

```bash
npm run dev
```

Confirm:

```bash
curl http://localhost:3000/health
npm test
```

For a production restore, run the app with `NODE_ENV=production` and confirm startup configuration validation passes.

## Docker Compose Restore

Stop the app:

```bash
docker compose stop app
```

Restore the database into the named volume:

```bash
docker compose run --rm --no-deps app sh -c 'cat > /app/data/unianon.sqlite' < backups/unianon.sqlite
```

Restore matching deployment secrets in the host environment or secret manager.

Start the app:

```bash
docker compose up -d
```

Confirm:

```bash
docker compose ps
docker compose logs app
curl http://localhost:3000/health
```

## Restore Drill

Run this drill before production launch and after major schema changes.

1. Create a fresh backup from a non-production database.
2. Restore it into a separate temporary environment.
3. Start UniAnon with the same secret set.
4. Confirm `/health` returns `ok`.
5. Confirm `schema_migrations` has all expected versions.
6. Log in with a test account.
7. Confirm existing posts, comments, spaces, reports, cases, appeals, and audit events are visible.
8. Confirm a banned test user is still banned.
9. Create a new post and comment.
10. Shut down and delete the temporary restore environment.

## Incident Restore Notes

If restoring after compromise:

- Preserve the compromised database and logs separately for investigation.
- Rotate secrets only after deciding the account-continuity tradeoff.
- If `AUTH_SUBJECT_SECRET` or `NULLIFIER_SECRET` may be compromised, assume identity and nullifier mappings can be attacked.
- If `MEMBERSHIP_ASSERTION_SECRET` may be compromised, invalidate old assertions by rotating it.
- If session tokens may be compromised, delete rows from `sessions` after restore to force re-login.

Force re-login:

```sql
DELETE FROM sessions;
```

## Recovery Sign-Off

Record every restore:

- Restore date:
- Operator:
- Source backup:
- Git commit:
- Secrets restored:
- `schema_migrations` checked:
- `PRAGMA integrity_check` result:
- Account continuity expected:
- Known privacy tradeoffs:
