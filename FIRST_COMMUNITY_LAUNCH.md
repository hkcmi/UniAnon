# UniAnon First Community Launch Guide

This guide is for the first administrator or operator launching a new UniAnon community.

Use it after the app can run locally or in a pilot environment, but before inviting real users. UniAnon is privacy-first; every setup decision should reduce identity exposure and preserve community governability.

## Launch Roles

Assign these responsibilities before launch:

- System operator: owns deployment, secrets, backups, logs, and incident response.
- Community administrator: owns allowed domains, spaces, rules, and moderator appointments.
- Moderators: handle direct moderation actions allowed by policy.
- Trusted launch jurors: high-trust users who can test and participate in jury governance.
- Privacy reviewer: checks the production privacy checklist and identity boundaries.

Do not give one person unchecked control over every role for a real community.

## Step 1: Choose Community Boundaries

Record the community definition:

- Community name:
- `COMMUNITY_ID`:
- Allowed domains:
- Public URL:
- Authentication mode:
- Governance contact:
- Launch date:

Rules:

- `COMMUNITY_ID` should be stable for the life of the community.
- `ALLOWED_DOMAINS` should contain only domains approved for membership.
- Do not use personal email domains unless the community explicitly accepts the privacy and access-control tradeoff.
- Document whether multiple domains represent one shared community or separate organizations.

## Step 2: Choose Authentication Mode

Preferred high-privacy mode:

- Minimal-claims OIDC.
- `OIDC_SCOPES=openid`.
- Domain membership from `hd`, `domain`, or `domain_group`.
- No `email` or `profile` scope unless explicitly accepted.

Lower-privacy pilot mode:

- SMTP magic links.
- Accept that the SMTP provider sees recipient email addresses.

Local-only demo mode:

- `EMAIL_DELIVERY=dev`.
- Never use this for a real community.

Record the chosen mode and accepted tradeoffs in [PRODUCTION_PRIVACY_CHECKLIST.md](PRODUCTION_PRIVACY_CHECKLIST.md).

## Step 3: Prepare Production Configuration

Complete these items before starting production:

- Set `NODE_ENV=production`.
- Set `APP_BASE_URL` to the public HTTPS URL.
- Set `ALLOWED_DOMAINS`.
- Generate distinct long random secrets.
- Configure `DATABASE_PATH`.
- Configure `REDIS_URL` if using Docker or multiple processes.
- Configure `TRUST_PROXY` only for a trusted reverse proxy.
- Confirm `EMAIL_DELIVERY` is not `dev`.
- Confirm production startup rejects unsafe defaults.

Generate secrets:

```bash
openssl rand -base64 48
```

Run:

```bash
npm test
docker compose config
```

## Step 4: Launch With Demo Data Disabled

Demo seed accounts are useful locally but must not exist in production.

Do not run:

```bash
npm run seed:demo
```

If demo data was accidentally loaded, rebuild the database before launch. Do not invite real users into a database that contains demo identities, spaces, or governance cases.

## Step 5: Create First Real Accounts

Use the selected auth mode to create real launch accounts.

Recommended sequence:

1. System operator logs in.
2. Community administrator logs in.
3. At least two moderators log in.
4. At least three trusted launch jurors log in.
5. A normal member logs in for workflow testing.
6. A test user is banned and used to test appeals.

Current MVP role assignment is still operator-assisted through the database/store layer. Until an admin role-management UI exists, assign roles carefully in a controlled environment and record every change.

Role examples:

- `system_admin`: deployment or emergency operator.
- `moderator`: direct moderation and approval participant.
- trusted juror: user with `trust_level >= 2`.

After assigning roles, restart or refresh the app if needed so the in-memory store reflects database changes.

## Step 6: Create Initial Spaces

Start small.

Recommended spaces:

- Public: visible to all verified members.
- Organization-specific space for each major domain group.
- Moderator-only or launch-team space only if its access boundaries are clear.

Restricted spaces require multi-party approval. Use this to test that one moderator cannot unilaterally create a sensitive space.

Record for each space:

- Name:
- Allowed domains:
- Created by:
- Approved by:
- Purpose:

## Step 7: Publish Community Rules

Rules should be short enough that users can remember them and concrete enough that jurors can apply them.

Minimum rule areas:

- Harassment and threats.
- Doxxing and identity exposure.
- Spam and manipulation.
- Confidential information.
- Moderator conduct.
- Appeal expectations.

Privacy rule:

Moderators and users must not request, reveal, speculate about, or pressure others to disclose real identity or email.

## Step 8: Configure Governance Thresholds

Review:

- `REPORT_WEIGHT_THRESHOLD`
- `JURY_APPROVAL_WEIGHT`
- `JURY_SIZE`
- `ADMIN_PROTECTION_APPROVAL_WEIGHT`
- `HIGH_IMPACT_APPROVAL_COUNT`

Launch defaults are conservative MVP values. Adjust only with a written reason.

Suggested first pilot:

- Keep `HIGH_IMPACT_APPROVAL_COUNT >= 2`.
- Keep protected-role approval higher than normal user thresholds.
- Keep `JURY_SIZE` large enough to avoid single-person outcomes.

## Step 9: Run A Governance Drill

Before inviting users, test the full governance path:

1. Create a normal post.
2. Create a comment.
3. Report the post.
4. Confirm a moderation case opens when the threshold is met.
5. Vote as an assigned trusted juror.
6. Confirm content hide or dismissal works.
7. Ban a test user.
8. Confirm the banned user cannot get a normal session.
9. Confirm the banned user can open an appeal with a membership assertion.
10. Vote on the appeal.
11. Confirm audit events appear.
12. Confirm public audit references are redacted.

Do not launch until this drill passes.

## Step 10: Run Privacy Checks

Complete:

- [PRODUCTION_PRIVACY_CHECKLIST.md](PRODUCTION_PRIVACY_CHECKLIST.md)
- [BACKUP_RESTORE.md](BACKUP_RESTORE.md) restore drill
- [INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md) incident lead assignment

Spot-check database columns:

```sql
PRAGMA table_info(users);
PRAGMA table_info(magic_tokens);
PRAGMA table_info(auth_events);
```

Expected:

- No plaintext email in `users`.
- No plaintext email in `magic_tokens`.
- No session plaintext token storage.
- Public audit references are redacted.

## Step 11: Prepare Moderator Operating Notes

Give moderators a short operating note:

- Use reports and jury flow for contested cases.
- Do not directly sanction protected roles.
- Use direct bans only for clear, non-protected cases.
- Never ask users for email or real identity.
- Record policy reasons clearly.
- Escalate privacy incidents immediately.
- Use appeals in good faith.

## Step 12: Launch Decision

Launch only when:

- CI is green for the deployed commit.
- Production config validation passes.
- HTTPS is working.
- Backup and restore drill passes.
- Incident response owner is named.
- Governance drill passes.
- At least two moderators can access admin tools.
- At least three trusted jurors can access jury tools.
- Public audit log redaction has been reviewed.

## Launch Record

Fill this in and keep it with deployment records:

- Community name:
- `COMMUNITY_ID`:
- Git commit:
- URL:
- Auth mode:
- Allowed domains:
- System operator:
- Community administrator:
- Moderators:
- Trusted launch jurors:
- Backup location:
- Incident lead:
- Accepted privacy tradeoffs:
- Launch approved by:
- Launch time:

## After Launch

First week checks:

- Review failed login/domain rejection patterns.
- Review rate-limit hits.
- Review public audit log clarity.
- Review moderator audit log.
- Confirm no plaintext email appears in database spot checks.
- Confirm users understand appeals.
- Tune thresholds only after reviewing real usage.

Do not add analytics until a privacy-preserving analytics policy exists.
