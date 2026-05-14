import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import net from 'node:net';
import vm from 'node:vm';
import express from 'express';
import { config } from '../src/config.js';
import { app, store } from '../src/server.js';

const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS || 10000);

function encodeJwtPart(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function signIdToken({ privateKey, claims, kid }) {
  const header = encodeJwtPart({ alg: 'RS256', typ: 'JWT', kid });
  const payload = encodeJwtPart(claims);
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${payload}`);
  signer.end();
  return `${header}.${payload}.${signer.sign(privateKey, 'base64url')}`;
}

async function getFreePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const { port } = server.address();
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
  return port;
}

async function listen(server) {
  if (server.listening) {
    return;
  }

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.once('listening', resolve);
  });
}

async function close(server) {
  if (!server?.listening) {
    return;
  }

  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function createFakeOidcProvider({ issuer, privateKey, jwk, clientId }) {
  const provider = express();
  const codes = new Map();

  provider.use(express.urlencoded({ extended: false }));

  provider.get('/.well-known/openid-configuration', (req, res) => {
    res.json({
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${issuer}/token`,
      jwks_uri: `${issuer}/jwks`,
      response_types_supported: ['code']
    });
  });

  provider.get('/authorize', (req, res) => {
    const code = `smoke-code-${crypto.randomUUID()}`;
    codes.set(code, {
      nonce: req.query.nonce,
      redirectUri: req.query.redirect_uri
    });

    const redirectUrl = new URL(req.query.redirect_uri);
    redirectUrl.searchParams.set('state', req.query.state);
    redirectUrl.searchParams.set('code', code);
    res.redirect(302, redirectUrl.toString());
  });

  provider.post('/token', (req, res) => {
    const codeRecord = codes.get(req.body.code);
    codes.delete(req.body.code);
    if (!codeRecord || codeRecord.redirectUri !== req.body.redirect_uri) {
      return res.status(400).json({ error: 'invalid_grant' });
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    res.json({
      token_type: 'Bearer',
      id_token: signIdToken({
        privateKey,
        kid: jwk.kid,
        claims: {
          iss: issuer,
          aud: clientId,
          sub: 'fake-browser-smoke-subject',
          nonce: codeRecord.nonce,
          hd: 'example.edu',
          iat: nowSeconds,
          exp: nowSeconds + 300
        }
      })
    });
  });

  provider.get('/jwks', (req, res) => {
    res.json({ keys: [jwk] });
  });

  return provider;
}

function runHandoffScript(script, sessionToken) {
  const localStorageValues = new Map();
  let replacedTo = '';
  const statusLine = { textContent: 'JavaScript is required to complete browser sign-in.' };

  const context = {
    document: {
      querySelector(selector) {
        if (selector === '#oidcHandoff') {
          return { dataset: { sessionToken } };
        }
        if (selector === '.status') {
          return statusLine;
        }
        return null;
      }
    },
    localStorage: {
      getItem(key) {
        return localStorageValues.get(key) || null;
      },
      setItem(key, value) {
        localStorageValues.set(key, value);
      }
    },
    window: {
      location: {
        replace(value) {
          replacedTo = value;
        }
      }
    }
  };

  vm.runInNewContext(script, context, { timeout: 1000 });
  return {
    storedToken: localStorageValues.get('unianon:token'),
    replacedTo,
    statusText: statusLine.textContent
  };
}

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = publicKey.export({ format: 'jwk' });
jwk.kid = 'oidc-browser-smoke-key';

const appPort = await getFreePort();
const providerPort = await getFreePort();
const appBaseUrl = `http://127.0.0.1:${appPort}`;
const issuer = 'https://fake-oidc.unianon.local';
const providerBaseUrl = `http://127.0.0.1:${providerPort}`;
const clientId = 'oidc-browser-smoke-client';
const originalFetch = globalThis.fetch;

const originalConfig = {
  allowedDomains: [...config.allowedDomains],
  emailDelivery: config.emailDelivery,
  oidc: { ...config.oidc }
};

config.allowedDomains = ['example.edu'];
config.emailDelivery = 'disabled';
config.oidc.issuer = issuer;
config.oidc.clientId = clientId;
config.oidc.clientSecret = 'oidc-browser-smoke-secret';
config.oidc.redirectUri = `${appBaseUrl}/auth/oidc/callback`;
config.oidc.scopes = ['openid'];
config.oidc.domainClaimNames = ['hd'];

const providerServer = createFakeOidcProvider({ issuer, privateKey, jwk, clientId }).listen(providerPort, '127.0.0.1');
const appServer = app.listen(appPort, '127.0.0.1');

try {
  await Promise.all([listen(providerServer), listen(appServer)]);
  globalThis.fetch = (url, options) => {
    const urlString = String(url);
    if (urlString.startsWith(issuer)) {
      return originalFetch(urlString.replace(issuer, providerBaseUrl), options);
    }
    return originalFetch(url, options);
  };

  const health = await fetchWithTimeout(`${appBaseUrl}/health`).then((response) => response.json());
  assert.equal(health.email_login_enabled, false);
  assert.equal(health.oidc_enabled, true);

  const startResponse = await fetchWithTimeout(`${appBaseUrl}/auth/oidc/start`);
  assert.equal(startResponse.status, 200);
  const startBody = await startResponse.json();
  assert.match(startBody.authorization_url, new RegExp(`^${issuer}/authorize`));

  const authorizeResponse = await fetchWithTimeout(startBody.authorization_url, { redirect: 'manual' });
  assert.equal(authorizeResponse.status, 302);
  const callbackUrl = authorizeResponse.headers.get('location');
  assert.match(callbackUrl, new RegExp(`^${appBaseUrl}/auth/oidc/callback`));

  const callbackResponse = await fetchWithTimeout(callbackUrl, {
    headers: { accept: 'text/html' }
  });
  assert.equal(callbackResponse.status, 200);
  assert.match(callbackResponse.headers.get('content-type'), /text\/html/);
  const html = await callbackResponse.text();
  assert.match(html, /OIDC verified/);
  assert.doesNotMatch(html, /fake-browser-smoke-subject/);

  const sessionToken = html.match(/data-session-token="([^"]+)"/)?.[1];
  assert.equal(typeof sessionToken, 'string');
  assert.ok(sessionToken.length > 20);

  const handoffScriptResponse = await fetchWithTimeout(`${appBaseUrl}/oidc-handoff.js`);
  assert.equal(handoffScriptResponse.status, 200);
  const handoffResult = runHandoffScript(await handoffScriptResponse.text(), sessionToken);
  assert.equal(handoffResult.storedToken, sessionToken);
  assert.equal(handoffResult.replacedTo, '/');

  const meResponse = await fetchWithTimeout(`${appBaseUrl}/me`, {
    headers: { authorization: `Bearer ${handoffResult.storedToken}` }
  });
  assert.equal(meResponse.status, 200);
  const meBody = await meResponse.json();
  assert.equal(meBody.user.domain_group, 'example.edu');
  assert.equal(Object.hasOwn(meBody.user, 'email'), false);
  assert.equal(store.users.get(meBody.user.user_hash).email, undefined);

  console.log(`OIDC browser smoke test passed on ${appBaseUrl} with fake provider ${issuer}`);
} catch (error) {
  console.error('OIDC browser smoke test failed.');
  throw error;
} finally {
  Object.assign(config, {
    allowedDomains: originalConfig.allowedDomains,
    emailDelivery: originalConfig.emailDelivery
  });
  Object.assign(config.oidc, originalConfig.oidc);
  globalThis.fetch = originalFetch;
  await Promise.allSettled([close(appServer), close(providerServer)]);
}
