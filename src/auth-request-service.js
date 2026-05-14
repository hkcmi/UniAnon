export function createAuthRequestService(store, options = {}) {
  const tokenTtlMs = options.tokenTtlMs;

  function recordMagicLinkRequest({ emailDigest, domainGroup, success, reason }) {
    return store.logAuthEvent({
      eventType: 'magic_link_requested',
      emailDigest,
      domainGroup,
      success,
      reason
    });
  }

  return {
    recordMagicLinkRequest,

    createMagicToken({ subjectHash, domainGroup, nullifier }) {
      return store.createMagicToken(subjectHash, domainGroup, tokenTtlMs, nullifier);
    }
  };
}
