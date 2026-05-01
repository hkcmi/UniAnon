import crypto from 'node:crypto';

export function normalizeEmail(email) {
  if (typeof email !== 'string') {
    return null;
  }

  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return null;
  }

  return normalized;
}

export function getDomain(email) {
  return email.split('@').at(-1);
}

export function isAllowedDomain(email, allowedDomains) {
  return allowedDomains.includes(getDomain(email));
}

export function createUserHash(email, serverSecret) {
  return crypto.createHmac('sha256', serverSecret).update(email).digest('hex');
}

export function publicUser(user) {
  return {
    user_hash: user.user_hash,
    nickname: user.nickname,
    domain_group: user.domain_group,
    trust_level: user.trust_level,
    created_at: user.created_at,
    banned: user.banned,
    roles: user.roles
  };
}
