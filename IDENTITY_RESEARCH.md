# UniAnon Identity Research Notes

This document tracks identity options that can reduce or remove email exposure while preserving domain-gated access, one-account-per-member enforcement, and revocation.

## Minimal-Claims OIDC

Status: prototype started.

Current implementation:

- Provider discovery.
- Authorization URL generation.
- Authorization code flow requirement.
- Default scope: `openid`.
- No default `email` or `profile` scope.

Privacy target:

- Prefer opaque `sub` from the organization IdP.
- Avoid email claims unless the deployment explicitly accepts the privacy tradeoff.
- Convert IdP subject into a community-scoped subject/nullifier at the Auth boundary.

Remaining work:

- Callback endpoint.
- ID token verification.
- State and nonce persistence.
- IdP subject to membership assertion issuance.

## SAML

Status: researched design target, not implemented.

SAML can support organization membership without SMTP, but privacy depends heavily on IdP attribute release.

Required IdP configuration:

- Release a stable opaque NameID or pairwise identifier.
- Do not release email by default.
- Do not release display name, department, title, or other identifying attributes.
- Sign assertions.
- Restrict audience to the UniAnon Auth Service.

UniAnon mapping:

```text
saml_pairwise_id -> auth subject -> community-scoped nullifier -> membership assertion
```

Risks:

- Many SAML deployments default to email NameID.
- IdP administrators can usually see sign-in events.
- Attribute release misconfiguration can deanonymize users.

## Anonymous Credentials / Blind Signatures

Status: target privacy architecture, research stage.

Goal:

- Issuer verifies membership.
- User receives a credential.
- Community verifies the credential without learning email or issuer account.
- Credential use produces a community-scoped nullifier for duplicate prevention and revocation.

Target property:

```text
same member + same community_id -> same nullifier
different community_id -> unlinkable nullifier
issuer cannot link issuance to community account
```

Open questions:

- Which credential scheme is practical for a Node.js MVP?
- How should revocation work without a global identity registry?
- Can users recover access after device loss without re-linking identity?
- What UX is acceptable for non-technical communities?
