# UniAnon Privacy Roadmap

UniAnon's highest product goal is privacy-preserving community access for speech protection.

The project should not overclaim anonymity. Instead, it should make every identity boundary explicit, minimize data exposure at each boundary, and gradually replace email-visible login with stronger privacy-preserving membership proofs.

## Privacy Principle

UniAnon should prove membership without revealing identity to the community.

In the long term, UniAnon must also reduce how much the login infrastructure can correlate real email addresses with community activity.

See `THREAT_MODEL.md` for the non-negotiable privacy requirements.

## Current Privacy Level

Current MVP:

- Users verify with an allowed email domain.
- The auth boundary signs a membership assertion containing an anonymous subject and domain group.
- The community stores `user_hash`, nickname, domain group, posts, comments, reports, governance cases, and audit records.
- The community does not display email addresses.
- The community does not store plaintext email addresses in user records.
- Session tokens are stored as hashes.
- SMTP delivery, when enabled, necessarily exposes recipient email addresses to the email delivery provider.

This is stable pseudonymity inside UniAnon, not full anonymity from all infrastructure.

## Privacy Levels

### Level 1: Community Pseudonymity

Goal: community users, moderators, and normal app data do not expose plaintext email.

Status: mostly implemented.

Remaining work:

- [ ] Ensure auth logs never store plaintext email by default.
- [ ] Add tests for audit/auth log redaction.
- [ ] Add admin UI rules that never show plaintext email.
- [ ] Add privacy-preserving export/delete tooling.

### Level 2: Auth/Community Separation

Goal: split email verification from community operation.

Architecture:

```text
Email/Auth Service -> issues signed membership assertion
Community Service -> accepts assertion and creates user_hash
```

The community service should not receive or store plaintext email.

Tasks:

- [ ] Create separate Auth Service boundary.
- [x] Define signed membership assertion format.
- [ ] Include domain group and pseudonymous subject, not plaintext email.
- [ ] Rotate signing keys safely.
- [ ] Restrict auth logs to redacted email or hashed email only.
- [ ] Document operator access controls.

### Level 3: Organization SSO With Minimal Claims

Goal: avoid magic-link email delivery where possible.

Use SAML/OIDC providers configured to release minimal claims:

- membership status
- domain/group
- stable opaque subject

Avoid requesting:

- full name
- profile photo
- phone number
- unnecessary email claims where possible

Tasks:

- [ ] Add OIDC login provider support.
- [ ] Add SAML login provider support.
- [ ] Support opaque subject mapping.
- [ ] Document privacy-preserving IdP configuration.
- [ ] Add tests that community user creation does not require plaintext email.

### Level 4: Email Alias / Relay Mode

Goal: reduce exposure of real email addresses to UniAnon and third-party SMTP providers.

Options:

- organization-managed aliases
- per-user verification aliases
- privacy relay addresses

Tradeoff:

- the organization or relay can still map alias to real person.

Tasks:

- [ ] Support alias-based verification.
- [ ] Store alias hash only.
- [ ] Document organization alias setup.
- [ ] Add UI language that warns users not to choose identifying nicknames.

### Level 5: Anonymous Credentials

Goal: prove "I am a member of this organization" without revealing which member.

Status: target architecture for highest privacy protection.

Possible approaches:

- blind signatures
- anonymous credentials
- zero-knowledge membership proofs

High-level flow:

```text
1. User proves membership to issuer.
2. Issuer gives a blind-signed credential.
3. User presents credential to UniAnon.
4. UniAnon verifies credential without seeing email.
5. UniAnon derives a stable pseudonym for governance.
```

Challenges:

- preventing duplicate accounts
- revocation and bans
- preserving stable governance identity
- making the flow usable
- avoiding custom cryptography mistakes

Tasks:

- [ ] Research mature anonymous credential libraries.
- [ ] Define duplicate-prevention requirements.
- [ ] Define revocation model.
- [ ] Prototype blind credential issuance.
- [ ] Threat-model issuer, community server, and user device.

## Design Rules

- Do not store plaintext email in community data.
- Do not show plaintext email in admin/moderator UI.
- Do not put email addresses in audit logs.
- Do not put sensitive identity data in URLs except short-lived login tokens.
- Prefer opaque IDs and signed assertions over profile claims.
- Treat SMTP providers as identity-aware infrastructure.
- Document every place where real identity can be observed.
- Use boring, reviewed cryptography before inventing anything custom.

## Near-Term Priority

The next privacy-focused implementation steps should be:

1. Add auth event logging with email redaction.
2. Add magic-link expiration tests.
3. Draft the Auth Service / Community Service split.
4. Define the nullifier and duplicate-prevention model.
5. Research anonymous credentials as the target privacy architecture.
