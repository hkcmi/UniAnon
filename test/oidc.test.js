import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createAuthorizationRequest,
  discoveryUrl,
  fetchDiscovery,
  normalizeIssuer,
  validateDiscovery
} from '../src/oidc.js';

test('normalizes issuer and builds discovery url', () => {
  assert.equal(normalizeIssuer('https://idp.example.edu/'), 'https://idp.example.edu');
  assert.equal(discoveryUrl('https://idp.example.edu/'), 'https://idp.example.edu/.well-known/openid-configuration');
  assert.equal(normalizeIssuer('http://idp.example.edu'), null);
});

test('validates minimal OIDC discovery metadata', () => {
  const discovery = validateDiscovery({
    issuer: 'https://idp.example.edu',
    authorization_endpoint: 'https://idp.example.edu/authorize',
    response_types_supported: ['code']
  }, 'https://idp.example.edu/');

  assert.equal(discovery.issuer, 'https://idp.example.edu');
  assert.equal(discovery.authorization_endpoint, 'https://idp.example.edu/authorize');
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
