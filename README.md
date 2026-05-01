# UniAnon

UniAnon is an open-source, domain-gated anonymous community platform that enables trusted access while preserving user anonymity through cryptographic identity abstraction.

## Positioning

UniAnon combines privacy-preserving identity with reputation-based governance to create a new model for trustworthy anonymous communities.

## Core Ideas

- Email is used for verification, not display.
- Users receive a stable anonymous identity derived from `HMAC_SHA256(email, server_secret)`.
- Communities can restrict membership by allowed email domains.
- Moderation power is constrained through audit logs and governance-ready workflows.
- The system can support multiple organizations and domain groups.

## MVP Scope

- Magic-link email verification flow.
- Domain-gated registration and login.
- Stable HMAC anonymous identity.
- Unique nickname setup.
- Posts and comments.
- Basic user bans.
- Moderation audit log.
- Multi-domain configuration.

## Governance Roadmap

- Trust levels from account age, post quality, likes, and negative moderation history.
- Weighted reporting and voting.
- Random high-trust jury selection.
- Appeal workflow for punished users.
- Multi-party approval for high-impact moderation actions.
- Public or semi-public audit transparency.

## Local Development

[![CI](https://github.com/hkcmi/UniAnon/actions/workflows/ci.yml/badge.svg)](https://github.com/hkcmi/UniAnon/actions/workflows/ci.yml)

```bash
npm install
npm run dev
```

The API defaults to `http://localhost:3000`.

Copy `.env.example` to `.env` for local configuration.

Open `http://localhost:3000` after starting the server to use the local web UI.

Seed local demo data:

```bash
npm run seed:demo
```

Demo login emails:

- `moderator@example.edu`
- `juror@example.edu`
- `reporter@example.edu`
- `member@example.edu`
- `accused@example.edu`
- `org-member@example.org`

Useful environment variables:

```bash
PORT=3000
DATABASE_PATH=data/unianon.sqlite
REDIS_URL=
SERVER_SECRET=replace-me-with-a-long-random-secret
ALLOWED_DOMAINS=example.edu,example.org,company.com
REPORT_WEIGHT_THRESHOLD=3
JURY_APPROVAL_WEIGHT=3
ADMIN_PROTECTION_APPROVAL_WEIGHT=8
```

For local development, `/auth/request-link` returns the verification token in the response. In production, this should be sent by an email provider and never returned to the client.

By default, local data is stored in `data/unianon.sqlite`. Tests use an in-memory SQLite database.

Rate limits use an in-memory store by default. Set `REDIS_URL` to use Redis-backed counters.

## Docker

Build and run the local MVP:

```bash
docker compose up --build
```

Open `http://localhost:3000`.

Seed demo data into the Docker volume:

```bash
docker compose run --rm app npm run seed:demo
docker compose restart app
```

If you have not started the app yet, you can run the seed command before `docker compose up --build`.

Stop the app:

```bash
docker compose down
```

SQLite data is stored in the `unianon-data` Docker volume. Docker Compose also starts Redis for rate limiting.

See [DEPLOYMENT.md](DEPLOYMENT.md) for the full local deployment guide.

## API Sketch

### `POST /auth/request-link`

Request a magic link token for an allowed email domain.

```json
{ "email": "student@example.edu" }
```

### `POST /auth/verify`

Verify a magic token and receive a session token.

```json
{ "token": "dev-token" }
```

### `POST /users/nickname`

Set the user's globally unique nickname. Requires `Authorization: Bearer <session_token>`.

```json
{ "nickname": "quiet-signal" }
```

### `GET /spaces`

List spaces visible to the current user. Public spaces are visible without authentication.

### `POST /spaces`

Create a domain-restricted space. Requires a moderator session.

```json
{
  "name": "Example Org",
  "allowed_domains": ["example.org"]
}
```

### `POST /posts`

Create a post. Requires authentication and nickname setup.

```json
{
  "space_id": "public",
  "content": "Hello from a verified anonymous member."
}
```

### `GET /posts`

List posts and comments visible to the current user. Shows nicknames only, never emails or raw hashes.

Optional query parameter:

```text
space_id=public
```

### `POST /posts/:postId/comments`

Create a comment. Requires authentication and nickname setup.

```json
{ "content": "I agree." }
```

### `POST /reports`

Report a post, comment, or user. Weighted reports can automatically open a moderation case.

```json
{
  "target_type": "post",
  "target_id": "post-id",
  "reason": "Policy violation"
}
```

### `GET /governance/cases`

List moderation cases. Requires a trusted user with `trust_level >= 2`.

### `POST /governance/cases/:caseId/votes`

Submit a jury vote. Requires a trusted user with `trust_level >= 2`.

```json
{
  "decision": "violation",
  "action": "hide_content"
}
```

Supported decisions: `violation`, `dismiss`.

Supported actions: `hide_content`, `ban_user`, `none`.

### `POST /moderation/ban`

Ban a user hash. Requires a moderator session.

```json
{ "user_hash": "target-user-hash", "reason": "policy violation" }
```

### `GET /moderation/audit-log`

Read moderation audit events. Requires a moderator session.

The local web UI also shows moderation tools to users with the `moderator` or `system_admin` role.

## Security Notes

- Never expose `SERVER_SECRET`.
- Do not store plaintext emails in the forum/content service.
- SQLite is intended for local MVP development. Production can move the same store boundary to PostgreSQL later.
