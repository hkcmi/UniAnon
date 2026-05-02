# UniAnon Privacy Model

UniAnon is designed for stable pseudonymity inside a trusted community. It is not designed to make email delivery invisible to the email infrastructure that sends the verification message.

## What UniAnon Hides

Inside the community app:

- Posts show nicknames, not email addresses.
- Comments show nicknames, not email addresses.
- Governance cases use `user_hash`, not email addresses.
- The forum/content database does not need plaintext email addresses.
- Session tokens are stored as SHA-256 hashes.
- Auth events store `email_digest = HMAC_SHA256(email, auth_log_secret)`, not plaintext email.
- Community identity is derived from a signed membership assertion subject:

```text
subject_hash = HMAC_SHA256(email, auth_subject_secret)
nullifier = HMAC_SHA256(community_id + subject_hash, nullifier_secret)
membership_assertion = sign({ iss, aud, subject_hash, nullifier, domain_group, exp })
```

The Community Service verifies the assertion issuer and audience, uses the assertion subject as `user_hash`, and stores `nullifier` as a private enforcement key. This means admins and moderators can govern stable anonymous accounts, prevent easy duplicate accounts, and preserve bans without directly seeing the user's email address in normal community workflows.

Banned users do not receive a normal session. They may receive a signed membership assertion so they can open an appeal without revealing or storing plaintext email in the Community Service.

## What UniAnon Cannot Hide

If UniAnon sends a magic link to `person@example.edu`, the email delivery path necessarily sees that recipient address.

Depending on deployment, this can include:

- The SMTP provider.
- The organization email server.
- Intermediate mail infrastructure.
- The recipient's mailbox provider.

This is a property of email delivery, not a bug in HMAC identity. HMAC protects the community identity layer; it does not make SMTP blind.

## Trust Boundary

UniAnon separates three boundaries:

1. Auth boundary: verifies email/domain and creates `user_hash`.
2. Community boundary: stores content, nicknames, governance data, moderation records, and community-scoped nullifiers.
3. Email boundary: delivers login links to real inboxes.

The strongest privacy posture is to keep the Auth and Email boundary small, audited, and separated from the Community boundary.

## Recommended Deployment Modes

### Local or Demo Mode

```bash
EMAIL_DELIVERY=dev
```

The magic token is returned in the API response. This is convenient for development but not appropriate for public production use.

### Organization-Controlled SMTP

Use an SMTP server controlled by the same organization whose members are joining.

Benefits:

- No external email provider learns membership activity.
- The trust relationship stays inside the organization.
- Email logs are governed by existing organization policy.

Tradeoff:

- The organization mail system can still see recipients.

### Third-Party SMTP Provider

Use a commercial SMTP provider only if the deployment accepts that provider as trusted infrastructure.

Minimum safeguards:

- Use a data processing agreement where appropriate.
- Disable unnecessary message retention if the provider supports it.
- Avoid putting sensitive community context in subject lines or email body.
- Send only the magic link and minimal sign-in copy.

### Split Auth Service

For stronger separation, deploy Auth Service separately from the community app:

- Auth Service handles email and magic links.
- Community Service receives only signed membership assertions scoped to its `community_id`, `user_hash`, nickname, domain group, roles, and session state.
- Community moderators do not get access to Auth Service logs.

This does not hide email from the Auth Service or SMTP provider, but it reduces who can correlate email with community activity.

## Optional Privacy Enhancements

- Allow users to verify with organization-managed email aliases.
- Support self-hosted SMTP.
- Support single-use magic links with short expiration.
- Store only hashed or encrypted auth event metadata.
- Use separate database credentials for auth and community data.
- Add a strict log policy that redacts email addresses.
- Add admin tooling that never displays plaintext email by default.

## Non-Goals

UniAnon does not currently provide:

- Tor-level anonymity.
- Blind email delivery where no mail server sees the recipient.
- Protection from an organization correlating mail server logs with access time.
- Protection from users choosing nicknames that reveal their real identity.

## Plain-Language Guarantee

UniAnon can keep your real email out of the community interface, content database, and moderation workflow.

UniAnon cannot prevent the email system used for login from knowing where it sent the login email.
