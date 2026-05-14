import { publicUser } from './identity.js';
import { createMembershipAssertion, verifyMembershipAssertion } from './membership-assertion.js';

export function createAuthService({ store, sessionService, sessionTtlMs }) {
  function createSessionPayload(user, extras = {}) {
    const sessionToken = sessionService.create(user.user_hash);
    return {
      session_token: sessionToken,
      ...extras,
      expires_in: Math.floor(sessionTtlMs / 1000),
      user: publicUser(user),
      nickname_required: !user.nickname
    };
  }

  function loginWithMembership({ subjectHash, domainGroup, nullifier }, options = {}) {
    const membershipAssertion = createMembershipAssertion({
      subjectHash,
      domainGroup,
      nullifier
    });
    const user = store.upsertUser(subjectHash, domainGroup, nullifier);
    const membershipExtras = options.includeMembershipAssertion
      ? { membership_assertion: membershipAssertion }
      : {};

    if (user.banned) {
      return {
        ok: false,
        status: 403,
        payload: {
          error: 'user_banned',
          ...membershipExtras,
          user: publicUser(user)
        }
      };
    }

    return {
      ok: true,
      status: 200,
      payload: createSessionPayload(user, membershipExtras)
    };
  }

  function verifyMagicToken(token) {
    const record = store.consumeMagicToken(token);
    if (!record) {
      return {
        ok: false,
        status: 400,
        payload: { error: 'invalid_or_expired_token' }
      };
    }

    return loginWithMembership({
      subjectHash: record.subject_hash,
      domainGroup: record.domain_group,
      nullifier: record.nullifier
    }, {
      includeMembershipAssertion: true
    });
  }

  function exchangeMembershipAssertion(assertionValue) {
    const assertion = verifyMembershipAssertion(assertionValue);
    if (!assertion) {
      return {
        ok: false,
        status: 400,
        payload: { error: 'invalid_or_expired_assertion' }
      };
    }

    return loginWithMembership({
      subjectHash: assertion.sub,
      domainGroup: assertion.domain_group,
      nullifier: assertion.nullifier
    });
  }

  return {
    createSessionPayload,
    loginWithMembership,
    verifyMagicToken,
    exchangeMembershipAssertion
  };
}
