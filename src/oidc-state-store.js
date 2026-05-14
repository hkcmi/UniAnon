export function createOidcStateStore(options = {}) {
  const states = new Map();
  const ttlMs = options.ttlMs;
  const now = options.now || (() => Date.now());

  function pruneExpired() {
    const currentTime = now();
    for (const [state, record] of states.entries()) {
      if (record.expires_at < currentTime) {
        states.delete(state);
      }
    }
  }

  return {
    save(state, nonce) {
      pruneExpired();
      states.set(state, {
        nonce,
        expires_at: now() + ttlMs
      });
    },

    consume(state) {
      const record = states.get(state);
      states.delete(state);
      if (!record || record.expires_at < now()) {
        return null;
      }
      return record;
    },

    size() {
      pruneExpired();
      return states.size;
    }
  };
}
