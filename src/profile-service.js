import { publicUser } from './identity.js';

const reservedNicknames = new Set([
  'admin',
  'administrator',
  'appeal_jury',
  'deleted',
  'jury',
  'moderator',
  'system',
  'system_admin',
  'unianon'
]);

export function validateNickname(nickname) {
  if (typeof nickname !== 'string') {
    return null;
  }

  const trimmed = nickname.trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,31}$/.test(trimmed)) {
    return null;
  }

  const canonical = trimmed.toLowerCase();
  if (reservedNicknames.has(canonical)) {
    return null;
  }

  if (canonical.includes('http') || canonical.includes('www') || canonical.includes('dotcom')) {
    return null;
  }

  return trimmed;
}

export function createProfileService(store) {
  return {
    setNickname(user, nickname) {
      const ok = store.setNickname(user.user_hash, nickname);
      if (!ok) {
        return { ok: false, status: 409, error: 'nickname_unavailable_or_already_set' };
      }

      return { ok: true, user: publicUser(user) };
    }
  };
}
