import { nanoid } from 'nanoid';

export function normalizeIssuer(issuer) {
  if (typeof issuer !== 'string') {
    return null;
  }

  const normalized = issuer.trim().replace(/\/+$/, '');
  if (!normalized.startsWith('https://')) {
    return null;
  }

  return normalized;
}

export function discoveryUrl(issuer) {
  const normalized = normalizeIssuer(issuer);
  return normalized ? `${normalized}/.well-known/openid-configuration` : null;
}

export function validateDiscovery(discovery, expectedIssuer) {
  const issuer = normalizeIssuer(expectedIssuer);
  if (!issuer || !discovery || typeof discovery !== 'object') {
    return null;
  }

  if (normalizeIssuer(discovery.issuer) !== issuer) {
    return null;
  }

  if (typeof discovery.authorization_endpoint !== 'string') {
    return null;
  }

  const responseTypes = Array.isArray(discovery.response_types_supported)
    ? discovery.response_types_supported
    : [];
  if (!responseTypes.includes('code')) {
    return null;
  }

  return {
    issuer,
    authorization_endpoint: discovery.authorization_endpoint
  };
}

export async function fetchDiscovery(issuer, fetchImpl = fetch) {
  const url = discoveryUrl(issuer);
  if (!url) {
    return null;
  }

  const response = await fetchImpl(url, {
    headers: { accept: 'application/json' }
  });
  if (!response.ok) {
    return null;
  }

  return validateDiscovery(await response.json(), issuer);
}

export function createAuthorizationRequest({ discovery, clientId, redirectUri, scopes = ['openid'] }) {
  if (!discovery?.authorization_endpoint || !clientId || !redirectUri) {
    return null;
  }

  const requestedScopes = scopes.includes('openid') ? scopes : ['openid', ...scopes];
  const state = nanoid(24);
  const nonce = nanoid(24);
  const url = new URL(discovery.authorization_endpoint);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', [...new Set(requestedScopes)].join(' '));
  url.searchParams.set('state', state);
  url.searchParams.set('nonce', nonce);

  return {
    authorization_url: url.toString(),
    state,
    nonce,
    requested_scopes: [...new Set(requestedScopes)]
  };
}
