import { canAccessSpace } from './content-service.js';

export function serializeSpace(space) {
  return {
    id: space.id,
    name: space.name,
    allowed_domains: space.allowed_domains,
    created_at: space.created_at
  };
}

export function validateSpaceName(name) {
  if (typeof name !== 'string') {
    return null;
  }

  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 80) {
    return null;
  }

  return trimmed;
}

export function normalizeSpaceRequest(body, allowedDomains) {
  const name = validateSpaceName(body.name);
  const domains = Array.isArray(body.allowed_domains)
    ? body.allowed_domains.map((domain) => String(domain).trim().toLowerCase()).filter(Boolean)
    : [];

  if (!name) {
    return { error: 'invalid_space_name' };
  }

  const unknownDomain = domains.find((domain) => !allowedDomains.includes(domain));
  if (unknownDomain) {
    return { error: 'domain_not_allowed', domain: unknownDomain };
  }

  return {
    payload: {
      name,
      allowed_domains: [...new Set(domains)].sort()
    }
  };
}

export function createSpaceService(store) {
  return {
    listAccessibleSpaces(user) {
      return [...store.spaces.values()]
        .filter((space) => canAccessSpace(user, space))
        .map(serializeSpace);
    },

    createSpace(payload) {
      return serializeSpace(store.createSpace(payload.name, payload.allowed_domains));
    }
  };
}
