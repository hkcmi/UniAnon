# UniAnon Deployment Guide

This guide covers the current local MVP deployment paths for UniAnon.

UniAnon is still early, but production startup now rejects unsafe defaults such as development secrets, duplicate secrets, dev email delivery, and localhost base URLs. The current deployment target is a local or internal pilot with SQLite persistence and a single app process.

## Requirements

For npm-based local use:

- Node.js 25 or newer.
- npm.

For Docker-based local use:

- Docker.
- Docker Compose.

Node.js 25 is required because UniAnon currently uses the built-in `node:sqlite` module.

## Environment

Copy the example file:

```bash
cp .env.example .env
```

Important variables:

```bash
PORT=3000
DATABASE_PATH=data/unianon.sqlite
REDIS_URL=
SERVER_SECRET=replace-me-with-a-long-random-secret
AUTH_SUBJECT_SECRET=replace-me-with-a-long-random-auth-subject-secret
MEMBERSHIP_ASSERTION_SECRET=replace-me-with-a-long-random-assertion-secret
MEMBERSHIP_ASSERTION_TTL_MS=300000
SESSION_TTL_MS=604800000
ALLOWED_DOMAINS=example.edu,example.org,company.com
MAGIC_TOKEN_TTL_MS=900000
APP_BASE_URL=http://localhost:3000
EMAIL_DELIVERY=dev
EMAIL_FROM=UniAnon <no-reply@localhost>
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
REPORT_WEIGHT_THRESHOLD=3
JURY_APPROVAL_WEIGHT=3
ADMIN_PROTECTION_APPROVAL_WEIGHT=8
```

Use long random secrets for any shared environment. `AUTH_SUBJECT_SECRET` controls the stable anonymous subject derived after email verification. Changing it will change user identities, so treat it as persistent instance identity. `MEMBERSHIP_ASSERTION_SECRET` signs short-lived membership assertions passed from the auth boundary to the community boundary.

## Email Delivery

Dev mode returns magic tokens in API responses:

```bash
EMAIL_DELIVERY=dev
```

SMTP mode sends magic links by email and does not return tokens:

```bash
EMAIL_DELIVERY=smtp
APP_BASE_URL=https://your-unianon.example
EMAIL_FROM=UniAnon <no-reply@your-unianon.example>
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-password
```

Use `SMTP_SECURE=true` for providers that require implicit TLS, usually on port `465`.

SMTP providers necessarily see recipient email addresses. See [PRIVACY.md](PRIVACY.md) before choosing a delivery provider.

Before running a real community or privacy-sensitive pilot, complete [PRODUCTION_PRIVACY_CHECKLIST.md](PRODUCTION_PRIVACY_CHECKLIST.md).

## Local Npm Run

Install dependencies:

```bash
npm install
```

Start the app:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

Docker Compose starts both the app and Redis. The app uses Redis for rate-limit counters through:

```bash
REDIS_URL=redis://redis:6379
```

Seed demo data:

```bash
npm run seed:demo
```

If the server is already running, restart it after seeding so the in-memory store reloads the new SQLite records.

Run tests:

```bash
npm test
```

## Docker Compose Run

Build and start:

```bash
docker compose up --build
```

Open:

```text
http://localhost:3000
```

Run on another host port:

```bash
PORT=3002 docker compose up --build
```

Seed demo data into the Docker volume:

```bash
docker compose run --rm app npm run seed:demo
docker compose restart app
```

Stop the app:

```bash
docker compose down
```

Stop and delete the SQLite volume:

```bash
docker compose down -v
```

## Data Storage

Npm local run:

```text
data/unianon.sqlite
```

Docker Compose run:

```text
unianon-data Docker volume mounted at /app/data
```

Rate-limit storage:

- Npm local run without `REDIS_URL`: in-memory counters.
- Docker Compose: Redis counters.

The app loads SQLite records into memory at startup and writes changes back to SQLite during API operations. Schema migrations are versioned in the `schema_migrations` table and run automatically before records are loaded. If an external script changes the database while the app is running, restart the app.

For backup, restore, and restore-drill procedures, see [BACKUP_RESTORE.md](BACKUP_RESTORE.md).

## Demo Accounts

After running `npm run seed:demo`, use these emails in the web UI:

- `moderator@example.edu`
- `juror@example.edu`
- `reporter@example.edu`
- `member@example.edu`
- `accused@example.edu`
- `org-member@example.org`

In dev mode, `/auth/request-link` returns the magic token directly. The web UI fills the token input automatically.

## Health Check

Use:

```bash
curl http://localhost:3000/health
```

Expected response:

```json
{"ok":true,"allowed_domains":["example.edu","example.org","company.com"]}
```

Docker Compose also has a container healthcheck that calls this endpoint.

## Updating

Pull the latest code:

```bash
git pull --rebase origin main
```

For npm:

```bash
npm install
npm test
npm run dev
```

For Docker:

```bash
docker compose up --build
```

## Current Limits

- Dev mode returns magic links in API responses.
- SMTP delivery sends text and HTML magic-link emails.
- Sessions expire according to `SESSION_TTL_MS`; browser-side refresh handling is still basic.
- Redis rate limiting is implemented for key write paths, but policy tuning is still early.
- SQLite stores session token hashes, not plaintext session tokens.
- Magic-token records store anonymous subject hashes, not plaintext email.
- SQLite is intended for local MVP use.
- The current app is a standalone MVP. NodeBB is only an optional future bridge target; see [OPTIONAL_INTEGRATIONS.md](OPTIONAL_INTEGRATIONS.md).

## Troubleshooting

If port `3000` is already in use:

```bash
PORT=3001 npm run dev
```

or:

```bash
PORT=3002 docker compose up --build
```

If seeded data does not appear:

- Restart the app.
- Confirm `DATABASE_PATH` points to the expected SQLite file.
- For Docker, confirm you seeded the same Compose project volume.

If Docker starts but the app is unhealthy:

```bash
docker compose logs app
```

If login rejects an email domain, add it to:

```bash
ALLOWED_DOMAINS=example.edu,example.org,company.com
```
