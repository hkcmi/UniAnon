export function bearerTokenFromHeader(header) {
  const value = String(header || '');
  return value.startsWith('Bearer ') ? value.slice('Bearer '.length) : null;
}

export function createSessionService(store) {
  return {
    create(userHash) {
      return store.createSession(userHash);
    },

    findUserByToken(token) {
      return token ? store.findSession(token) : null;
    },

    findUserByAuthorization(header) {
      return this.findUserByToken(bearerTokenFromHeader(header));
    },

    findActiveUserByAuthorization(header) {
      const user = this.findUserByAuthorization(header);
      return user && !user.banned ? user : null;
    }
  };
}
