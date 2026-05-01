# UniAnon Threat Model

UniAnon exists to protect speech in communities where trusted access matters. The highest-risk failure is not spam or moderation error; it is a user being linked back to a real-world identity because they spoke inside UniAnon.

This threat model treats privacy as a safety requirement.

## Primary Safety Goal

A user's UniAnon posts, comments, votes, reports, and governance participation must not be linkable to their real email address by the Community Service, moderators, normal administrators, database readers, or ordinary log access.

Long-term target:

```text
Prove membership without revealing identity.
Preserve one-account-per-member and bans without storing or revealing email.
```

## Assets To Protect

- Real email address.
- Real-world identity.
- Community nickname.
- Stable anonymous account identifier.
- Domain membership.
- Posts and comments.
- Reports and votes.
- Ban and appeal history.
- Login timing and credential issuance timing.

## Threat Actors

### Community Moderator

Can moderate content and view governance tools.

Must not be able to see:

- plaintext email
- auth logs containing email
- SMTP logs
- identity mapping tables

### System Administrator

Can operate servers and databases.

Risk:

- database inspection
- log inspection
- backup inspection
- accidental debug output

Mitigation target:

- no plaintext email in Community Service database
- no plaintext email in Community Service logs
- split Auth Service from Community Service
- minimize Auth Service logs

### Email Provider

Can see recipient addresses for emails it delivers.

Important reality:

```text
SMTP cannot deliver email without knowing the recipient address.
```

Therefore, third-party SMTP is not acceptable for the highest privacy mode.

### Organization Identity Provider

Can verify membership.

Risk:

- IdP logs may show login to UniAnon
- IdP may release identifying claims

Mitigation target:

- request minimal claims only
- avoid email/name/profile claims where possible
- prefer opaque subject or anonymous credential issuance

### Database Reader Or Leaked Backup

Can inspect stored data.

Must not find:

- plaintext email
- raw session token
- email-to-post mapping
- email-to-nullifier mapping in the Community database

### Colluding Parties

Examples:

- Auth operator plus Community operator
- Email provider plus Community operator
- Organization IdP plus Community operator

Highest privacy mode should reduce the usefulness of collusion by preventing direct identifiers from crossing service boundaries.

## Non-Negotiable Requirements

### Community Service Must Not Know Email

The Community Service must not accept, store, log, display, or derive from plaintext email.

Allowed Community inputs:

- signed membership assertion
- anonymous credential proof
- domain group
- nullifier
- public verification metadata

Implemented MVP step:

```text
magic token -> signed membership assertion -> community session
```

The magic-token store keeps `subject_hash`, `nullifier`, and `domain_group`, not plaintext email.

Disallowed Community inputs:

- email
- name
- phone
- profile image
- organization user ID if it is reversible or identifying

### No Plaintext Email In Logs

Any log that may be accessible to operators must redact email by default.

Allowed:

```text
domain_group=example.edu
email_digest=HMAC(email, auth_log_secret)
```

Implemented MVP auth events store:

```text
event_type
email_digest
domain_group
success
reason
created_at
```

Disallowed:

```text
email=person@example.edu
```

### One Account Per Member Without Email Storage

UniAnon must prevent easy multiple accounts without storing email in the Community Service.

Target mechanism:

```text
nullifier = privacy-preserving stable identifier scoped to community_id
```

Implemented MVP mechanism:

```text
subject_hash = HMAC_SHA256(email, auth_subject_secret)
nullifier = HMAC_SHA256(community_id + subject_hash, nullifier_secret)
```

This is not the final anonymous-credential design because the Auth boundary can still derive the nullifier. It is still an important step: the Community boundary can enforce one account per member and make bans survive re-entry without storing email.

Community stores:

```text
nullifier
domain_group
nickname
trust_level
banned
appeal case metadata
```

Community does not store:

```text
email
auth provider user ID
email hash that an operator can query directly
```

### Bans Must Survive Re-Registration

If a member is banned, the same membership source must not produce a fresh unrelated Community identity for the same community.

Target:

```text
same member + same community_id -> same nullifier
```

But:

```text
nullifier must not reveal email
```

### Appeal Without Email Exposure

Banned users cannot receive a normal community session, but they can still prove membership and open an appeal. When `/auth/verify` detects a banned user, it returns a signed membership assertion instead of a session. The appeal endpoint accepts that assertion and opens an `appeal_case` without storing plaintext email.

### Moderator Action Safeguards

Direct moderator bans are intentionally narrow. A moderator cannot ban themselves, cannot ban users who are already banned, and cannot directly ban protected users with `moderator` or `system_admin` roles. Protected-user sanctions must go through governance and satisfy `ADMIN_PROTECTION_APPROVAL_WEIGHT`.

### User-Supplied Identity Leakage

Users can still choose text that reveals themselves. UniAnon reduces accidental leakage by rejecting reserved system nicknames, URL-like nicknames, control characters, and obvious repeated-character spam, but it cannot guarantee users will never self-identify in content.

## Acceptable Privacy Modes

### Mode 0: Development

- Dev magic token returned in API response.
- Not suitable for real privacy-sensitive use.

### Mode 1: Pseudonymous MVP

- Community does not store plaintext email.
- SMTP may still see email.
- Suitable only for demos or low-risk communities.

### Mode 2: Split Auth

- Auth Service handles email.
- Community Service never receives email.
- Community receives signed membership assertion.
- Third-party SMTP is still a risk if used.

### Mode 3: Minimal-Claim SSO

- Organization IdP verifies membership.
- UniAnon requests only minimal claims.
- Community does not receive email.
- IdP may still know the user accessed UniAnon.

### Mode 4: Anonymous Credential

- Issuer verifies membership.
- User receives anonymous credential.
- Community verifies credential and nullifier.
- Community does not know email.
- Issuer should not be able to identify the Community account from the credential presentation.

This is the target mode for strong speech protection.

## Highest Privacy Architecture

```text
[User Device]
  - proves organization membership to issuer
  - receives anonymous credential
  - presents proof to Community

[Credential Issuer]
  - verifies email domain or organization membership
  - enforces issuance policy
  - does not learn Community nickname/posts

[Community Service]
  - verifies credential proof
  - stores nullifier and domain_group
  - never receives email
```

## Open Research Questions

- Which mature anonymous credential library should UniAnon use?
- How should duplicate prevention work without weakening anonymity?
- How should revocation work after bans?
- Can credentials be scoped per community while preserving unlinkability across communities?
- Can the UX stay simple enough for non-technical users?
- How should lost credentials be recovered without deanonymization?

## Engineering Rule

Any new feature must answer:

```text
Could this help link a UniAnon action to a real email address?
```

If yes, the feature must be redesigned, isolated to Auth Service, redacted, or rejected.
