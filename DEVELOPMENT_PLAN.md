# UniAnon Development Plan

This file is the working task plan for UniAnon. Keep it updated as the project moves from API prototype to locally usable MVP, then toward production readiness.

## Current Status

Completed:

- [x] Initialize GitHub-connected repository.
- [x] Keep upstream `LICENSE` from GitHub.
- [x] Create Node.js / Express API prototype.
- [x] Implement domain-gated email login flow.
- [x] Generate stable anonymous HMAC user identity.
- [x] Add nickname setup.
- [x] Add posts and comments.
- [x] Add public and domain-restricted spaces.
- [x] Add reports, moderation cases, jury voting, bans, content hiding, and audit log.
- [x] Add API tests.
- [x] Push first MVP API commit to GitHub.

## Development Goal

Build UniAnon into a locally usable anonymous community system first, then prepare it for deployment.

The next major milestone is:

> A developer can clone the repo, run one command, open a local web app, register with a dev magic link, create posts/comments, report content, and test governance flows.

Privacy is the highest-level product goal. Any feature that touches identity, auth, logs, moderation, or analytics must preserve or improve the privacy model documented in `PRIVACY.md` and `PRIVACY_ROADMAP.md`.

The threat model in `THREAT_MODEL.md` is a product constraint, not optional documentation.

## Phase 1: Local Usable MVP

Goal: make UniAnon usable on a local machine, not only through raw API calls.

- [x] Add persistent database layer.
- [x] Choose local database for MVP: SQLite.
- [ ] Replace in-memory store with repository/service layer.
- [x] Add database bootstrap migrations.
- [x] Add `.env.example` for local configuration.
- [x] Add seed script for local demo data.
- [x] Add real dev login flow page.
- [x] Add web frontend.
- [ ] Add pages:
  - [x] Login by email.
  - [x] Set nickname.
  - [x] Space list.
  - [x] Post list.
  - [x] Post detail with comments.
  - [x] Create post.
  - [x] Report content.
  - [x] Governance case list.
  - [x] Jury voting page.
  - [x] Basic moderation/audit page.
- [x] Add local dev command that starts API and frontend together.
- [x] Update README with local usage instructions.

## Phase 2: Security and Anti-Abuse

Goal: make the MVP harder to abuse and closer to real community use.

- [x] Add Redis support.
- [ ] Add rate limits:
  - [x] Magic link requests per email.
  - [x] Magic link requests per IP.
  - [x] Post creation per user.
  - [x] Comment creation per user.
  - [x] Report creation per user.
  - [x] Jury voting cooldowns.
- [x] Add session expiration.
- [x] Add secure session storage.
- [x] Add stronger validation for content and nicknames.
- [x] Add moderator action safeguards.
- [x] Add appeal case model.
- [x] Add user-facing error messages.

## Phase 3: Reputation and Governance

Goal: make governance more complete and closer to the project specification.

- [x] Implement trust-level calculation.
- [x] Track account age.
- [x] Track post/comment quality signals.
- [x] Track negative report/moderation history.
- [x] Add weighted report rules.
- [x] Add random jury selection.
- [x] Prevent jury conflicts of interest.
- [x] Add administrator protection thresholds.
- [x] Add multi-party approval for high-impact actions.
- [x] Add appeal workflow.
- [x] Add transparent audit views.

## Phase 4: Email and Auth Productionization

Goal: replace dev-only magic token responses with real email delivery.

- [x] Add SMTP provider support.
- [ ] Add SendGrid or similar provider option.
- [x] Add email templates.
- [x] Stop returning magic tokens in SMTP mode.
- [x] Add magic link expiration tests.
- [x] Add auth event logging.
- [x] Document auth privacy guarantees.

## Phase 4.5: Privacy-First Identity

Goal: move beyond email-visible login toward stronger privacy-preserving membership proofs.

- [x] Add auth event logging with email redaction.
- [x] Split Auth Service and Community Service design.
- [x] Define signed membership assertion format.
- [ ] Add OIDC minimal-claims prototype.
- [ ] Research SAML support.
- [ ] Research anonymous credentials / blind signatures.
- [x] Define duplicate-prevention model for anonymous credentials.
- [x] Add community-scoped nullifier for duplicate prevention and ban persistence.
- [ ] Define revocation model for anonymous credentials.
- [x] Define speech-protection threat model.

## Phase 5: Deployment

Goal: make the project easy to run outside the developer machine.

- [x] Add Dockerfile.
- [x] Add docker-compose for app and SQLite volume.
- [x] Add `.env.example`.
- [x] Add health checks.
- [x] Add production start command.
- [x] Add CI test workflow.
- [x] Add deployment guide.

## Phase 6: NodeBB Integration

Goal: decide whether UniAnon remains standalone or becomes a NodeBB auth/governance plugin.

- [ ] Research NodeBB plugin auth hooks.
- [ ] Define user mapping between UniAnon `user_hash` and NodeBB user IDs.
- [ ] Prototype NodeBB SSO or plugin login.
- [ ] Decide which service owns posts/comments.
- [ ] Decide which service owns moderation/governance.
- [ ] Document standalone vs NodeBB architecture tradeoffs.

## Suggested Next Sprint

Recommended next tasks:

1. Define nullifier and duplicate-prevention model.
2. Draft Auth Service / Community Service split.
3. Add auth event logging with email redaction.
4. Continue separating store logic into clearer repository/service modules.

Suggested implementation order:

1. Keep the current Express API.
2. Add SQLite first for easiest local development.
3. Create a small frontend after persistence works.
4. Move to PostgreSQL only when deployment needs it.

## Working Rules

- Update this file whenever a task is completed.
- Commit after each coherent milestone.
- Keep tests passing before pushing.
- Prefer small working increments over large unfinished rewrites.
- Do not remove the GitHub `LICENSE`.
