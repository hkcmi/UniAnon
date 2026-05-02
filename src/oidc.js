import crypto from 'node:crypto';
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
    authorization_endpoint: discovery.authorization_endpoint,
    token_endpoint: typeof discovery.token_endpoint === 'string' ? discovery.token_endpoint : null,
    jwks_uri: typeof discovery.jwks_uri === 'string' ? discovery.jwks_uri : null
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

function decodeJson(value) {
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function stringClaim(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export async function exchangeAuthorizationCode({
  discovery,
  code,
  clientId,
  clientSecret = '',
  redirectUri,
  fetchImpl = fetch
}) {
  if (!discovery?.token_endpoint || !code || !clientId || !redirectUri) {
    return null;
  }

  const body = new URLSearchParams();
  body.set('grant_type', 'authorization_code');
  body.set('code', code);
  body.set('client_id', clientId);
  body.set('redirect_uri', redirectUri);
  if (clientSecret) {
    body.set('client_secret', clientSecret);
  }

  const response = await fetchImpl(discovery.token_endpoint, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded'
    },
    body
  });
  if (!response.ok) {
    return null;
  }

  const tokens = await response.json();
  return typeof tokens?.id_token === 'string' ? tokens : null;
}

export async function fetchJwks(jwksUri, fetchImpl = fetch) {
  if (!jwksUri) {
    return null;
  }

  const response = await fetchImpl(jwksUri, {
    headers: { accept: 'application/json' }
  });
  if (!response.ok) {
    return null;
  }

  const jwks = await response.json();
  return Array.isArray(jwks?.keys) ? jwks : null;
}

export function verifyIdToken(idToken, { issuer, clientId, nonce, jwks, now = Date.now() } = {}) {
  if (!idToken || !issuer || !clientId || !nonce || !jwks?.keys) {
    return null;
  }

  const parts = idToken.split('.');
  if (parts.length !== 3) {
    return null;
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  const header = decodeJson(encodedHeader);
  const claims = decodeJson(encodedPayload);
  if (!header || !claims || header.alg !== 'RS256') {
    return null;
  }

  const jwk = header.kid
    ? jwks.keys.find((key) => key.kid === header.kid && key.kty === 'RSA')
    : jwks.keys.find((key) => key.kty === 'RSA');
  if (!jwk) {
    return null;
  }

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${encodedHeader}.${encodedPayload}`);
  verifier.end();

  let verified = false;
  try {
    verified = verifier.verify(crypto.createPublicKey({ key: jwk, format: 'jwk' }), signature, 'base64url');
  } catch {
    return null;
  }
  if (!verified) {
    return null;
  }

  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  const nowSeconds = Math.floor(now / 1000);
  if (
    claims.iss !== issuer ||
    !audience.includes(clientId) ||
    (audience.length > 1 && claims.azp !== clientId) ||
    claims.nonce !== nonce ||
    !stringClaim(claims.sub) ||
    typeof claims.exp !== 'number' ||
    claims.exp <= nowSeconds ||
    (typeof claims.nbf === 'number' && claims.nbf > nowSeconds + 60) ||
    (typeof claims.iat === 'number' && claims.iat > nowSeconds + 60)
  ) {
    return null;
  }

  return claims;
}

export function extractVerifiedDomainFromClaims(claims, allowedDomains, domainClaimNames = ['hd', 'domain', 'domain_group']) {
  if (!claims || !Array.isArray(allowedDomains)) {
    return null;
  }

  for (const claimName of domainClaimNames) {
    const value = stringClaim(claims[claimName]);
    if (value && allowedDomains.includes(value.toLowerCase())) {
      return value.toLowerCase();
    }
  }

  const email = stringClaim(claims.email);
  if (claims.email_verified === true && email?.includes('@')) {
    const domain = email.split('@').at(-1).toLowerCase();
    if (allowedDomains.includes(domain)) {
      return domain;
    }
  }

  return null;
}
