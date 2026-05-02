import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { test } from 'node:test';
import {
  createAuthorizationRequest,
  discoveryUrl,
  exchangeAuthorizationCode,
  extractVerifiedDomainFromClaims,
  fetchJwks,
  fetchDiscovery,
  normalizeIssuer,
  validateDiscovery,
  verifyIdToken
} from '../src/oidc.js';

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function signIdToken({ claims, privateKey, kid = 'test-key' }) {
  const header = encode({ alg: 'RS256', typ: 'JWT', kid });
  const payload = encode(claims);
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${payload}`);
  signer.end();
  return `${header}.${payload}.${signer.sign(privateKey, 'base64url')}`;
}

test('normalizes issuer and builds discovery url', () => {
  assert.equal(normalizeIssuer('https://idp.example.edu/'), 'https://idp.example.edu');
  assert.equal(discoveryUrl('https://idp.example.edu/'), 'https://idp.example.edu/.well-known/openid-configuration');
  assert.equal(normalizeIssuer('http://idp.example.edu'), null);
});

test('validates minimal OIDC discovery metadata', () => {
  const discovery = validateDiscovery({
    issuer: 'https://idp.example.edu',
    authorization_endpoint: 'https://idp.example.edu/authorize',
    token_endpoint: 'https://idp.example.edu/token',
    jwks_uri: 'https://idp.example.edu/jwks',
    response_types_supported: ['code']
  }, 'https://idp.example.edu/');

  assert.equal(discovery.issuer, 'https://idp.example.edu');
  assert.equal(discovery.authorization_endpoint, 'https://idp.example.edu/authorize');
  assert.equal(discovery.token_endpoint, 'https://idp.example.edu/token');
  assert.equal(discovery.jwks_uri, 'https://idp.example.edu/jwks');
  assert.equal(validateDiscovery({ issuer: 'https://other.example.edu' }, 'https://idp.example.edu'), null);
});

test('fetches discovery using injected fetch implementation', async () => {
  const discovery = await fetchDiscovery('https://idp.example.edu', async (url) => {
    assert.equal(url, 'https://idp.example.edu/.well-known/openid-configuration');
    return {
      ok: true,
      async json() {
        return {
          issuer: 'https://idp.example.edu',
          authorization_endpoint: 'https://idp.example.edu/authorize',
          token_endpoint: 'https://idp.example.edu/token',
          jwks_uri: 'https://idp.example.edu/jwks',
          response_types_supported: ['code']
        };
      }
    };
  });

  assert.equal(discovery.issuer, 'https://idp.example.edu');
});

test('creates minimal-claims authorization request', () => {
  const request = createAuthorizationRequest({
    discovery: {
      authorization_endpoint: 'https://idp.example.edu/authorize'
    },
    clientId: 'client-123',
    redirectUri: 'https://unianon.example.org/auth/oidc/callback',
    scopes: ['openid']
  });
  const url = new URL(request.authorization_url);

  assert.equal(url.searchParams.get('client_id'), 'client-123');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://unianon.example.org/auth/oidc/callback');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('scope'), 'openid');
  assert.equal(request.requested_scopes.includes('email'), false);
  assert.equal(request.state.length > 20, true);
  assert.equal(request.nonce.length > 20, true);
});

test('exchanges authorization code without requesting profile data', async () => {
  const tokens = await exchangeAuthorizationCode({
    discovery: {
      token_endpoint: 'https://idp.example.edu/token'
    },
    code: 'auth-code',
    clientId: 'client-123',
    clientSecret: 'client-secret',
    redirectUri: 'https://unianon.example.org/auth/oidc/callback',
    async fetchImpl(url, options) {
      assert.equal(url, 'https://idp.example.edu/token');
      assert.equal(options.method, 'POST');
      assert.equal(options.body.get('grant_type'), 'authorization_code');
      assert.equal(options.body.get('code'), 'auth-code');
      assert.equal(options.body.get('client_id'), 'client-123');
      assert.equal(options.body.get('client_secret'), 'client-secret');
      assert.equal(options.body.has('email'), false);
      return {
        ok: true,
        async json() {
          return { id_token: 'header.payload.signature' };
        }
      };
    }
  });

  assert.equal(tokens.id_token, 'header.payload.signature');
});

test('fetches JWKS and verifies RS256 ID token claims', async () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = publicKey.export({ format: 'jwk' });
  jwk.kid = 'test-key';
  const nowSeconds = Math.floor(Date.now() / 1000);
  const idToken = signIdToken({
    privateKey,
    claims: {
      iss: 'https://idp.example.edu',
      aud: 'client-123',
      sub: 'opaque-subject',
      nonce: 'nonce-123',
      hd: 'example.edu',
      iat: nowSeconds,
      exp: nowSeconds + 300
    }
  });
  const jwks = await fetchJwks('https://idp.example.edu/jwks', async (url) => {
    assert.equal(url, 'https://idp.example.edu/jwks');
    return {
      ok: true,
      async json() {
        return { keys: [jwk] };
      }
    };
  });
  const claims = verifyIdToken(idToken, {
    issuer: 'https://idp.example.edu',
    clientId: 'client-123',
    nonce: 'nonce-123',
    jwks
  });

  assert.equal(claims.sub, 'opaque-subject');
  assert.equal(verifyIdToken(idToken, {
    issuer: 'https://idp.example.edu',
    clientId: 'client-123',
    nonce: 'wrong-nonce',
    jwks
  }), null);
  assert.equal(verifyIdToken(signIdToken({
    privateKey,
    kid: 'unknown-key',
    claims: {
      iss: 'https://idp.example.edu',
      aud: 'client-123',
      sub: 'opaque-subject',
      nonce: 'nonce-123',
      iat: nowSeconds,
      exp: nowSeconds + 300
    }
  }), {
    issuer: 'https://idp.example.edu',
    clientId: 'client-123',
    nonce: 'nonce-123',
    jwks
  }), null);
});

test('extracts verified domain without requiring stored email', () => {
  assert.equal(extractVerifiedDomainFromClaims({ sub: '123', hd: 'example.edu' }, ['example.edu']), 'example.edu');
  assert.equal(extractVerifiedDomainFromClaims({
    sub: '123',
    email: 'person@example.org',
    email_verified: true
  }, ['example.org']), 'example.org');
  assert.equal(extractVerifiedDomainFromClaims({
    sub: '123',
    email: 'person@example.org',
    email_verified: false
  }, ['example.org']), null);
});
