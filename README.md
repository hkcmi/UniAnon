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
- Privacy is the primary product goal; identity exposure boundaries must be explicit and minimized.

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

Open `http://localhost:3000` after starting the server to use the local web UI. The UI supports posting, commenting, reporting, jury voting, appeal review, moderator space approvals, direct moderation actions, and public/admin audit views for local governance testing.

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
TRUST_PROXY=
DATABASE_PATH=data/unianon.sqlite
REDIS_URL=
SERVER_SECRET=replace-me-with-a-long-random-secret
AUTH_SUBJECT_SECRET=replace-me-with-a-long-random-auth-subject-secret
AUTH_LOG_SECRET=replace-me-with-a-long-random-auth-log-secret
NULLIFIER_SECRET=replace-me-with-a-long-random-nullifier-secret
COMMUNITY_ID=unianon-local
MEMBERSHIP_ASSERTION_SECRET=replace-me-with-a-long-random-assertion-secret
SESSION_TTL_MS=604800000
ALLOWED_DOMAINS=example.edu,example.org,company.com
EMAIL_DELIVERY=dev
APP_BASE_URL=http://localhost:3000
OIDC_ISSUER=
OIDC_CLIENT_ID=
OIDC_CLIENT_SECRET=
OIDC_REDIRECT_URI=
OIDC_SCOPES=openid
OIDC_DOMAIN_CLAIMS=hd,domain,domain_group
OIDC_STATE_TTL_MS=600000
REPORT_WEIGHT_THRESHOLD=3
JURY_APPROVAL_WEIGHT=3
JURY_SIZE=5
ADMIN_PROTECTION_APPROVAL_WEIGHT=8
HIGH_IMPACT_APPROVAL_COUNT=2
```

For local development, `/auth/request-link` returns the verification token in the response. Set `EMAIL_DELIVERY=smtp` to send magic links through SMTP instead.

By default, local data is stored in `data/unianon.sqlite`. Tests use an in-memory SQLite database. SQLite schema changes are tracked in the `schema_migrations` table and applied automatically at startup.

Production startup validates configuration and rejects unsafe defaults such as `dev-only-change-me`, duplicate secrets, `EMAIL_DELIVERY=dev`, and localhost `APP_BASE_URL`.

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

Error responses keep a stable machine-readable `error` code and include a user-facing `message`.

### `POST /auth/request-link`

Request a magic link token for an allowed email domain.

```json
{ "email": "student@example.edu" }
```

### `POST /auth/verify`

Verify a magic token and receive a signed membership assertion plus a session token.

```json
{ "token": "dev-token" }
```

### `POST /auth/exchange`

Exchange a signed membership assertion for a community session. The assertion contains an issuer, target community audience, anonymous subject, nullifier, and domain group, not an email address.

```json
{ "membership_assertion": "signed-assertion" }
```

### `GET /auth/oidc/start`

Start a minimal-claims OIDC sign-in. It is disabled unless `OIDC_ISSUER`, `OIDC_CLIENT_ID`, and `OIDC_REDIRECT_URI` are configured. The default scope is only `openid`; do not request `email` or `profile` unless the deployment accepts that privacy tradeoff.

### `GET /auth/oidc/callback`

Complete OIDC sign-in after the identity provider redirects back with `code` and `state`. UniAnon verifies the provider metadata, exchanges the code, validates the RS256 `id_token` signature, issuer, audience, expiry, and nonce, then creates a session from `iss + sub`.

OIDC identity does not use email to derive the UniAnon user hash. Domain membership should come from a configured verified domain claim such as `hd`, `domain`, or `domain_group`; verified email fallback is supported only for providers that cannot issue a domain-only claim.

### `POST /users/nickname`

Set the user's globally unique nickname. Requires `Authorization: Bearer <session_token>`.

```json
{ "nickname": "quiet-signal" }
```

Nicknames must be 3-32 characters, start with a letter or number, and use only letters, numbers, `_`, or `-`. Reserved system names and URL-like nicknames are rejected.

### `GET /spaces`

List spaces visible to the current user. Public spaces are visible without authentication.

### `POST /spaces`

Request creation of a domain-restricted space. Requires a moderator session. Restricted space creation is a high-impact action and requires `HIGH_IMPACT_APPROVAL_COUNT` distinct moderator/admin approvals before the space is created.

```json
{
  "name": "Example Org",
  "allowed_domains": ["example.org"]
}
```

The first request returns `202` with an `approval_request`. A later matching request from another moderator/admin returns `201` with the created `space`.

### `GET /approvals`

List approval requests. Requires a moderator session.

### `POST /posts`

Create a post. Requires authentication and nickname setup.

```json
{
  "space_id": "public",
  "content": "Hello from a verified anonymous member."
}
```

Posts, comments, reports, and appeals reject control characters, empty content, content above 5000 characters, and extreme repeated-character noise.

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

Report weight is capped and based on the reporter's trust level. Protected users with `moderator` or `system_admin` roles require `ADMIN_PROTECTION_APPROVAL_WEIGHT` report weight before a case opens.

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

When a case opens, UniAnon assigns up to `JURY_SIZE` trusted users at random and excludes the accused user and reporters from that jury.

### `POST /appeals`

Open an appeal for a banned user or hidden post/comment. Active users can use a bearer session. Banned users can submit the `membership_assertion` returned by `/auth/verify` when login is denied with `user_banned`.

```json
{
  "membership_assertion": "signed-assertion-for-banned-users",
  "target_type": "user",
  "target_id": "target-user-hash",
  "reason": "Please review this action."
}
```

### `GET /appeals`

List appeal cases. Requires a trusted user with `trust_level >= 2`.

### `POST /appeals/:appealId/votes`

Submit an appeal jury vote. Requires a trusted user with `trust_level >= 2`.

```json
{ "decision": "approve" }
```

Supported decisions: `approve`, `dismiss`.

### `POST /moderation/ban`

Ban a user hash. Requires a moderator session.

```json
{ "user_hash": "target-user-hash", "reason": "policy violation" }
```

Direct moderator bans cannot target the acting moderator or protected users with `moderator` / `system_admin` roles. Protected-user sanctions must go through governance and use `ADMIN_PROTECTION_APPROVAL_WEIGHT`.

Protected users also require `ADMIN_PROTECTION_APPROVAL_WEIGHT` violation vote weight before a jury can approve a sanction.

### `GET /moderation/audit-log`

Read moderation audit events. Requires a moderator session.

The local web UI also shows moderation tools to users with the `moderator` or `system_admin` role.

### `GET /audit-log`

Read the public transparent audit log. This endpoint redacts raw actor and target hashes into short audit references, while preserving operation type, target type, reason, and timestamp.

## Security Notes

- Never expose `SERVER_SECRET`.
- Use separate `AUTH_SUBJECT_SECRET`, `AUTH_LOG_SECRET`, `NULLIFIER_SECRET`, and `MEMBERSHIP_ASSERTION_SECRET` outside local demos.
- Do not store plaintext emails in the forum/content service.
- Pending magic-token records store anonymous subject hashes and community-scoped nullifiers, not plaintext email.
- Nullifiers are private enforcement keys for one-account-per-member and ban persistence. They are not returned by public user APIs.
- Auth event logs store `email_digest`, domain, result, reason, and timestamp. They do not store plaintext email, magic tokens, or session tokens.
- Session tokens are returned once to clients; SQLite stores only SHA-256 token hashes.
- SQLite is intended for local MVP development. Production can move the same store boundary to PostgreSQL later.

See [PRIVACY.md](PRIVACY.md) for the anonymity and email-delivery trust model.

See [PRIVACY_ROADMAP.md](PRIVACY_ROADMAP.md) for the long-term privacy-first architecture plan.

See [THREAT_MODEL.md](THREAT_MODEL.md) for the speech-protection threat model.

See [IDENTITY_RESEARCH.md](IDENTITY_RESEARCH.md) for OIDC, SAML, and anonymous-credential identity notes.

See [PRODUCTION_PRIVACY_CHECKLIST.md](PRODUCTION_PRIVACY_CHECKLIST.md) before running a real community or privacy-sensitive pilot.

See [BACKUP_RESTORE.md](BACKUP_RESTORE.md) for SQLite backup, restore, and restore-drill procedures.

See [INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md) for incident response and secret rotation procedures.

See [OPTIONAL_INTEGRATIONS.md](OPTIONAL_INTEGRATIONS.md) for the policy that keeps NodeBB and other bridges optional rather than core dependencies.

See [DEPLOYMENT.md](DEPLOYMENT.md) for reverse proxy, TLS, and production hardening notes.

## Trust Levels

Trust levels are calculated from privacy-preserving community activity:

- Account age.
- Visible posts and comments.
- Upheld moderation violations.
- Protected `moderator` / `system_admin` roles.

The Community Service calculates trust from `user_hash` activity and does not need plaintext email.
