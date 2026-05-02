# UniAnon Optional Integrations

UniAnon is now developed as an independent privacy-first community product.

The current core product is:

- Express API.
- Local web UI in `public/`.
- SQLite persistence.
- Redis-backed rate limiting when configured.
- Built-in governance, moderation, appeals, audit logs, and multi-party approvals.
- Privacy-preserving identity flows through magic links, membership assertions, and minimal-claims OIDC.

Integrations with existing forum engines may be useful later, but they are not required for the MVP and must not weaken UniAnon's privacy boundaries.

## Integration Policy

Any optional integration must satisfy these rules:

- The standalone UniAnon app remains fully usable without the integration.
- The integration cannot receive plaintext email from the Community Service.
- The integration cannot bypass membership assertions, nullifiers, bans, or governance rules.
- The integration cannot expose raw nullifiers or raw private audit identifiers.
- Moderator actions initiated through the integration must still write UniAnon audit events.
- High-impact actions must still use UniAnon's multi-party approval rules.
- The integration must be documented as lower priority than core privacy, governance, and deployment hardening.

## NodeBB Bridge Status

NodeBB is an optional future integration target, not the core architecture.

The original NodeBB idea was useful for scoping forum features quickly, but UniAnon now owns its own product surface. This keeps privacy, governance, identity, and audit logic in one codebase instead of depending on a forum plugin boundary.

Current status:

- No NodeBB plugin is required to run UniAnon.
- No NodeBB service is started by Docker Compose.
- No NodeBB schema is part of the SQLite database.
- No NodeBB API is called by the app.
- No NodeBB package is a project dependency.

## Possible Future NodeBB Bridge

If a NodeBB bridge is ever built, it should be thin and reversible.

Acceptable responsibilities:

- Render or mirror UniAnon posts in a NodeBB instance.
- Forward post/comment/report actions to UniAnon APIs.
- Display UniAnon governance status and public audit references.
- Use UniAnon sessions or membership assertions rather than NodeBB-native identity as the source of truth.

Non-goals:

- Replacing UniAnon's identity model with NodeBB accounts.
- Storing plaintext email in NodeBB to power UniAnon participation.
- Letting NodeBB moderators bypass UniAnon governance.
- Using NodeBB as the canonical audit log.
- Making NodeBB required for local development, tests, or deployment.

## Bridge Boundary Sketch

```text
[NodeBB UI or Plugin]
        |
        | forwards authenticated community actions
        v
[UniAnon API]
        |
        | owns identity, governance, audit, persistence
        v
[UniAnon Store]
```

In this model, NodeBB is only a presentation/client layer. UniAnon remains the authority for:

- allowed domains
- sessions
- user hashes
- nullifiers
- bans
- reports
- jury voting
- appeals
- audit logs
- space access

## Priority

Before any optional integration work, finish:

1. Production deployment hardening.
2. Incident response and secret rotation runbooks.
3. Admin-facing first launch guide.
4. More complete governance UX.
5. Privacy-preserving identity improvements beyond email-visible flows.

Only after those areas are stable should a NodeBB bridge be considered.
