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
- [x] Add OIDC minimal-claims prototype.
- [x] Research SAML support.
- [x] Research anonymous credentials / blind signatures.
- [x] Define duplicate-prevention model for anonymous credentials.
- [x] Add community-scoped nullifier for duplicate prevention and ban persistence.
- [x] Define revocation model for anonymous credentials.
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

## Phase 6: Standalone Product Hardening

Goal: keep UniAnon as an independent privacy-first community product and harden it for real deployments.

- [x] Decide standalone product direction over NodeBB-first integration.
- [x] Add production configuration safety checks.
- [x] Complete OIDC callback and ID token verification.
- [x] Improve standalone governance/admin UI.
- [x] Add structured database migration versioning.
- [x] Add backup and restore documentation.
- [x] Add production privacy checklist.
- [x] Keep NodeBB bridge as an optional future integration, not a core dependency.
- [x] Add deployment hardening notes for reverse proxy and TLS.
- [x] Add production runbook for incident response and secret rotation.
- [x] Add admin-facing setup guide for first community launch.
- [x] Improve governance UX for case detail and evidence review.
- [x] Add automated smoke test for production configuration.
- [x] Add privacy-preserving analytics policy.
- [x] Add operator role-management workflow.
- [x] Add governance case detail route for focused evidence review.
- [x] Add operator-facing production readiness checklist command.
- [x] Add privacy-preserving aggregate metrics prototype.
- [x] Add system admin bootstrap command for first deployment.
- [x] Add appeal detail route for focused appeal review.
- [x] Add readiness command tests for database migration inspection.
- [x] Add local metrics retention pruning.
- [x] Add bootstrap command tests for first-admin safety.
- [x] Add moderator-facing appeal detail link in the local UI.
- [x] Add CI readiness dry-run step with database fixture.
- [x] Add aggregate metrics documentation examples.
- [x] Add bootstrap command documentation for Docker deployments.
- [x] Add governance case detail link in the local UI.
- [x] Add CI bootstrap command dry-run step.
- [x] Add aggregate metrics UI suppressed-count hint.
- [x] Add Docker readiness command example.
- [x] Add moderation detail UI loading status.
- [x] Add CI smoke artifact summary.
- [x] Add operator notes for suppressed metrics in launch guide.
- [x] Add docker compose profile notes for lower-privacy SMTP deployments.
- [x] Add operator docs for detail-route access requirements.
- [x] Add CI failure triage notes for production smoke checks.
- [x] Add launch-guide note for metrics retention review.
- [x] Add Docker Compose OIDC env-file example for higher-privacy deployments.
- [x] Add governance drill notes for appeal evidence review.
- [x] Add readiness failure triage notes for production configuration.
- [x] Add operator reminder to review analytics policy before launch.
- [x] Add explicit OIDC-only login UI state.
- [x] Add disabled-email API documentation.
- [x] Add README link from readiness command to deployment triage notes.
- [x] Add launch record field for identity provider privacy owner.
- [x] Add OIDC callback web handoff note.
- [x] Add health endpoint auth-mode test to CI summary docs.
- [x] Add production note for disabled magic-link login.
- [x] Add first-week review item for IdP claim minimization.
- [x] Implement OIDC callback browser handoff page.
- [x] Add OIDC callback browser handoff tests.
- [x] Add OIDC-only launch checklist command coverage.
- [x] Add IdP claim-minimization example to launch guide.
- [x] Add OIDC handoff page styling.
- [x] Add OIDC handoff failure page.
- [x] Add readiness summary note for OIDC-only mode.
- [x] Add OIDC handoff CSP-compatible no-inline-script option.
- [x] Add OIDC handoff manual fallback link.
- [x] Add OIDC callback failure-page docs.
- [x] Add OIDC-only readiness example output.
- [x] Add OIDC handoff asset test.
- [x] Add OIDC handoff no-JS limitation note.
- [x] Add OIDC failure page status-code examples.
- [x] Add readiness warning note for missing Redis in single-process trials.
- [x] Add OIDC static asset cache note.
- [x] Add OIDC browser flow smoke test plan.
- [x] Add OIDC state replay warning to docs.
- [x] Add Redis readiness warning example output.
- [x] Add reverse-proxy cache note for auth routes.
- [x] Add OIDC browser flow automation backlog item.
- [x] Add OIDC state replay test coverage.
- [x] Add Redis readiness deployment checklist item.
- [x] Add reverse-proxy no-cache header example.
- [x] Extract OIDC state tracking into a service boundary.
- [x] Extract session token lookup into a service boundary.
- [x] Add shared service factory for server infrastructure dependencies.

## Automation Backlog

- [x] Add an automated browser smoke test for the OIDC start/callback handoff using a local fake OIDC provider.

## Suggested Next Sprint

Recommended next tasks:

1. Replace in-memory store globals with repository/service boundaries.
2. Add SendGrid or provider-adapter option for lower-privacy email pilots.

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
