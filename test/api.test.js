import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { after, before, test } from 'node:test';
import { config } from '../src/config.js';
import { createMembershipAssertion } from '../src/membership-assertion.js';
import { app, store } from '../src/server.js';

let baseUrl;
let server;

async function signup(email, nickname) {
  const requestLink = await fetch(`${baseUrl}/auth/request-link`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email })
  });
  assert.equal(requestLink.status, 201);
  const { token } = await requestLink.json();

  const verify = await fetch(`${baseUrl}/auth/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token })
  });
  assert.equal(verify.status, 200);
  const { session_token: sessionToken, user } = await verify.json();

  const nicknameResponse = await fetch(`${baseUrl}/users/nickname`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${sessionToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ nickname })
  });
  assert.equal(nicknameResponse.status, 201);

  return { sessionToken, user };
}

function encodeJwtPart(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function signIdToken({ privateKey, claims, kid = 'api-test-key' }) {
  const header = encodeJwtPart({ alg: 'RS256', typ: 'JWT', kid });
  const payload = encodeJwtPart(claims);
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${payload}`);
  signer.end();
  return `${header}.${payload}.${signer.sign(privateKey, 'base64url')}`;
}

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
});

test('rejects unapproved email domains', async () => {
  const response = await fetch(`${baseUrl}/auth/request-link`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'person@blocked.test' })
  });

  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.error, 'domain_not_allowed');
  assert.equal(typeof body.message, 'string');
  assert.match(body.message, /domain/i);
});

test('serves the local web UI', async () => {
  const response = await fetch(`${baseUrl}/`);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /<title>UniAnon<\/title>/);
});

test('supports signup, nickname, post, and comment flow', async () => {
  const requestLink = await fetch(`${baseUrl}/auth/request-link`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'person@example.edu' })
  });
  assert.equal(requestLink.status, 201);
  const { token } = await requestLink.json();

  const verify = await fetch(`${baseUrl}/auth/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token })
  });
  assert.equal(verify.status, 200);
  const { session_token: sessionToken, membership_assertion: membershipAssertion, user } = await verify.json();
  assert.equal(user.domain_group, 'example.edu');
  assert.equal(user.nickname, null);
  assert.equal(typeof membershipAssertion, 'string');
  assert.equal([...store.sessions.values()].some((session) => {
    return session.user_hash === user.user_hash && typeof session.expires_at === 'number';
  }), true);

  const nickname = await fetch(`${baseUrl}/users/nickname`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${sessionToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ nickname: 'quiet_signal' })
  });
  assert.equal(nickname.status, 201);

  const createPost = await fetch(`${baseUrl}/posts`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${sessionToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ content: 'Hello UniAnon.' })
  });
  assert.equal(createPost.status, 201);
  const { post } = await createPost.json();
  assert.equal(post.nickname, 'quiet_signal');

  const createComment = await fetch(`${baseUrl}/posts/${post.id}/comments`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${sessionToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ content: 'First comment.' })
  });
  assert.equal(createComment.status, 201);

  const list = await fetch(`${baseUrl}/posts`);
  const { posts } = await list.json();
  assert.equal(posts.length, 1);
  assert.equal(posts[0].comments.length, 1);
});

test('rejects unsafe nicknames and noisy content', async () => {
  const user = await signup('validation@example.edu', 'validation_user');

  const nicknameUser = await signup('validation-nick@example.edu', 'validation_nick');
  const reservedNickname = await fetch(`${baseUrl}/users/nickname`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${nicknameUser.sessionToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ nickname: 'admin' })
  });
  assert.equal(reservedNickname.status, 400);

  const urlNicknameUser = await signup('validation-url@example.edu', 'validation_url');
  const urlNickname = await fetch(`${baseUrl}/users/nickname`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${urlNicknameUser.sessionToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ nickname: 'www_user' })
  });
  assert.equal(urlNickname.status, 400);

  const controlCharPost = await fetch(`${baseUrl}/posts`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${user.sessionToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ content: 'hello\u0001world' })
  });
  assert.equal(controlCharPost.status, 400);

  const repeatedCharPost = await fetch(`${baseUrl}/posts`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${user.sessionToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ content: 'a'.repeat(80) })
  });
  assert.equal(repeatedCharPost.status, 400);
});

test('exchanges membership assertion without email', async () => {
  const requestLink = await fetch(`${baseUrl}/auth/request-link`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'assertion@example.edu' })
  });
  assert.equal(requestLink.status, 201);
  const { token } = await requestLink.json();

  const verify = await fetch(`${baseUrl}/auth/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token })
  });
  assert.equal(verify.status, 200);
  const { membership_assertion: membershipAssertion, user } = await verify.json();

  const exchange = await fetch(`${baseUrl}/auth/exchange`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ membership_assertion: membershipAssertion })
  });
  assert.equal(exchange.status, 200);
  const exchanged = await exchange.json();
  assert.equal(exchanged.user.user_hash, user.user_hash);
  assert.equal(exchanged.user.domain_group, 'example.edu');
  assert.equal(Object.hasOwn(exchanged.user, 'email'), false);
  assert.equal(Object.hasOwn(exchanged.user, 'nullifier'), false);
});

test('completes OIDC callback with domain claim and no stored email', async () => {
  const originalOidc = { ...config.oidc };
  const originalFetch = globalThis.fetch;
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = publicKey.export({ format: 'jwk' });
  jwk.kid = 'api-test-key';
  let nonce;

  config.oidc.issuer = 'https://idp.example.edu';
  config.oidc.clientId = 'client-123';
  config.oidc.clientSecret = 'client-secret';
  config.oidc.redirectUri = `${baseUrl}/auth/oidc/callback`;
  config.oidc.scopes = ['openid'];
  config.oidc.domainClaimNames = ['hd'];

  globalThis.fetch = async (url, options) => {
    if (String(url) === 'https://idp.example.edu/.well-known/openid-configuration') {
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
    }

    if (String(url) === 'https://idp.example.edu/token') {
      assert.equal(options.body.get('code'), 'oidc-code');
      const nowSeconds = Math.floor(Date.now() / 1000);
      return {
        ok: true,
        async json() {
          return {
            id_token: signIdToken({
              privateKey,
              claims: {
                iss: 'https://idp.example.edu',
                aud: 'client-123',
                sub: 'opaque-idp-subject',
                nonce,
                hd: 'example.edu',
                iat: nowSeconds,
                exp: nowSeconds + 300
              }
            })
          };
        }
      };
    }

    if (String(url) === 'https://idp.example.edu/jwks') {
      return {
        ok: true,
        async json() {
          return { keys: [jwk] };
        }
      };
    }

    return originalFetch(url, options);
  };

  try {
    const start = await originalFetch(`${baseUrl}/auth/oidc/start`);
    assert.equal(start.status, 200);
    const startBody = await start.json();
    nonce = startBody.nonce;
    assert.equal(new URL(startBody.authorization_url).searchParams.get('scope'), 'openid');

    const callback = await originalFetch(`${baseUrl}/auth/oidc/callback?state=${startBody.state}&code=oidc-code`);
    assert.equal(callback.status, 200);
    const body = await callback.json();

    assert.equal(typeof body.session_token, 'string');
    assert.equal(body.user.domain_group, 'example.edu');
    assert.equal(body.user.user_hash.includes('opaque-idp-subject'), false);
    assert.equal(store.users.get(body.user.user_hash).email, undefined);
  } finally {
    Object.assign(config.oidc, originalOidc);
    globalThis.fetch = originalFetch;
  }
});

test('prevents duplicate community accounts with the same nullifier', async () => {
  const firstAssertion = createMembershipAssertion({
    subjectHash: 'public-subject-a',
    domainGroup: 'example.edu',
    nullifier: 'shared-member-nullifier'
  }, {
    ttlMs: 60_000
  });
  const secondAssertion = createMembershipAssertion({
    subjectHash: 'public-subject-b',
    domainGroup: 'example.edu',
    nullifier: 'shared-member-nullifier'
  }, {
    ttlMs: 60_000
  });

  const firstExchange = await fetch(`${baseUrl}/auth/exchange`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ membership_assertion: firstAssertion })
  });
  assert.equal(firstExchange.status, 200);
  const first = await firstExchange.json();

  const secondExchange = await fetch(`${baseUrl}/auth/exchange`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ membership_assertion: secondAssertion })
  });
  assert.equal(secondExchange.status, 200);
  const second = await secondExchange.json();

  assert.equal(second.user.user_hash, first.user.user_hash);
  assert.equal(store.users.has('public-subject-b'), false);
});

test('rejects re-entry for a banned nullifier', async () => {
  const firstAssertion = createMembershipAssertion({
    subjectHash: 'banned-public-subject-a',
    domainGroup: 'example.edu',
    nullifier: 'banned-member-nullifier'
  }, {
    ttlMs: 60_000
  });

  const firstExchange = await fetch(`${baseUrl}/auth/exchange`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ membership_assertion: firstAssertion })
  });
  assert.equal(firstExchange.status, 200);
  const first = await firstExchange.json();
  store.banUser('system', first.user.user_hash, 'test ban');

  const secondAssertion = createMembershipAssertion({
    subjectHash: 'banned-public-subject-b',
    domainGroup: 'example.edu',
    nullifier: 'banned-member-nullifier'
  }, {
    ttlMs: 60_000
  });

  const secondExchange = await fetch(`${baseUrl}/auth/exchange`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ membership_assertion: secondAssertion })
  });
  assert.equal(secondExchange.status, 403);
  assert.equal(store.users.has('banned-public-subject-b'), false);
});

test('rejects expired sessions', async () => {
  const user = await signup('expired-session@example.edu', 'expired_session');
  const session = [...store.sessions.entries()].find(([, value]) => value.user_hash === user.user.user_hash);
  assert.notEqual(session, undefined);
  const [sessionHash, sessionRecord] = session;
  sessionRecord.expires_at = Date.now() - 1;

  const response = await fetch(`${baseUrl}/me`, {
    headers: { authorization: `Bearer ${user.sessionToken}` }
  });

  assert.equal(response.status, 401);
  assert.equal(store.sessions.has(sessionHash), false);
});

test('stores only hashed session tokens', async () => {
  const user = await signup('hashed-session@example.edu', 'hashed_session');
  const rows = store.db.prepare('SELECT token, token_hash FROM sessions').all();
  const row = rows.find((candidate) => {
    return candidate.token_hash && candidate.token_hash.length === 64;
  });

  assert.notEqual(row, undefined);
  assert.equal(rows.some((candidate) => candidate.token === user.sessionToken), false);
  assert.equal(store.sessions.has(user.sessionToken), false);
});

test('stores no plaintext email on user records', () => {
  for (const user of store.users.values()) {
    assert.equal(Object.hasOwn(user, 'email'), false);
  }
});

test('stores no plaintext email in magic token records', () => {
  const columns = store.db.prepare('PRAGMA table_info(magic_tokens)').all().map((column) => column.name);
  assert.equal(columns.includes('email'), false);

  for (const tokenRecord of store.magicTokens.values()) {
    assert.equal(Object.hasOwn(tokenRecord, 'email'), false);
  }
});

test('rejects expired magic link tokens', async () => {
  const token = store.createMagicToken('expired-subject', 'example.edu', -1, 'expired-nullifier');

  const verify = await fetch(`${baseUrl}/auth/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token })
  });

  assert.equal(verify.status, 400);
  const body = await verify.json();
  assert.equal(body.error, 'invalid_or_expired_token');
  assert.equal(store.users.has('expired-subject'), false);
});

test('stores auth events with redacted email digests only', async () => {
  const response = await fetch(`${baseUrl}/auth/request-link`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'auth-log@example.edu' })
  });
  assert.equal(response.status, 201);

  const columns = store.db.prepare('PRAGMA table_info(auth_events)').all().map((column) => column.name);
  assert.equal(columns.includes('email'), false);
  assert.equal(columns.includes('email_digest'), true);

  const event = store.authEvents.find((candidate) => candidate.domain_group === 'example.edu' && candidate.reason === 'sent');
  assert.notEqual(event, undefined);
  assert.match(event.email_digest, /^[a-f0-9]{64}$/);
  assert.equal(event.email_digest.includes('auth-log@example.edu'), false);
  assert.equal(Object.hasOwn(event, 'email'), false);
});

test('opens a moderation case from weighted reports and resolves by jury vote', async () => {
  const accused = await signup('accused@example.edu', 'case_accused');
  const reporter = await signup('reporter@example.edu', 'case_reporter');
  const juror = await signup('juror@example.edu', 'case_juror');

  store.users.get(reporter.user.user_hash).trust_level = 2;
  store.users.get(juror.user.user_hash).trust_level = 2;

  const createPost = await fetch(`${baseUrl}/posts`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accused.sessionToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ content: 'Content that should be reviewed.' })
  });
  assert.equal(createPost.status, 201);
  const { post } = await createPost.json();

  const reportResponse = await fetch(`${baseUrl}/reports`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${reporter.sessionToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      target_type: 'post',
      target_id: post.id,
      reason: 'Policy violation'
    })
  });
  assert.equal(reportResponse.status, 201);
  const reportResult = await reportResponse.json();
  assert.equal(reportResult.case.status, 'open');
  assert.equal(reportResult.case.juror_count, 1);
  assert.equal(reportResult.report_weight, 3);
  assert.equal(reportResult.report_threshold, 3);

  const reporterVoteResponse = await fetch(`${baseUrl}/governance/cases/${reportResult.case.id}/votes`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${reporter.sessionToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      decision: 'dismiss',
      action: 'none'
    })
  });
  assert.equal(reporterVoteResponse.status, 403);
  const reporterVoteResult = await reporterVoteResponse.json();
  assert.equal(reporterVoteResult.error, 'juror_not_assigned');

  const voteResponse = await fetch(`${baseUrl}/governance/cases/${reportResult.case.id}/votes`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${juror.sessionToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      decision: 'violation',
      action: 'hide_content'
    })
  });
  assert.equal(voteResponse.status, 201);
  const voteResult = await voteResponse.json();
  assert.equal(voteResult.case.status, 'resolved');
  assert.equal(voteResult.case.resolution.action, 'hide_content');

  const list = await fetch(`${baseUrl}/posts`);
  const { posts } = await list.json();
  assert.equal(posts.some((visiblePost) => visiblePost.id === post.id), false);
  assert.equal(store.auditLog.some((event) => event.operation === 'jury_decision'), true);
});

test('uses higher report thresholds for protected users', async () => {
  const protectedTarget = await signup('protected-report-target@example.edu', 'protected_report_target');
  const reporter = await signup('protected-report-reporter@example.edu', 'protected_reporter');

  const targetUser = store.users.get(protectedTarget.user.user_hash);
  targetUser.roles.push('moderator');
  store.persistUser(targetUser);

  const reporterUser = store.users.get(reporter.user.user_hash);
  reporterUser.trust_level = 2;
  store.persistUser(reporterUser);

  const reportResponse = await fetch(`${baseUrl}/reports`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${reporter.sessionToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      target_type: 'user',
      target_id: protectedTarget.user.user_hash,
      reason: 'Protected user report should need more weight.'
    })
  });
  assert.equal(reportResponse.status, 201);
  const reportResult = await reportResponse.json();
  assert.equal(reportResult.report_weight, 3);
  assert.equal(reportResult.report_threshold, 8);
  assert.equal(reportResult.case, null);
});

test('allows banned users to appeal with a membership assertion', async () => {
  const target = await signup('appeal-target@example.edu', 'appeal_target');
  const juror = await signup('appeal-juror@example.edu', 'appeal_juror');
  const jurorUser = store.users.get(juror.user.user_hash);
  jurorUser.trust_level = 2;
  store.persistUser(jurorUser);

  store.banUser('system', target.user.user_hash, 'appeal test ban');

  const requestLink = await fetch(`${baseUrl}/auth/request-link`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'appeal-target@example.edu' })
  });
  assert.equal(requestLink.status, 201);
  const { token } = await requestLink.json();

  const verify = await fetch(`${baseUrl}/auth/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token })
  });
  assert.equal(verify.status, 403);
  const bannedLogin = await verify.json();
  assert.equal(bannedLogin.error, 'user_banned');
  assert.equal(typeof bannedLogin.membership_assertion, 'string');

  const appealResponse = await fetch(`${baseUrl}/appeals`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      membership_assertion: bannedLogin.membership_assertion,
      target_type: 'user',
      target_id: target.user.user_hash,
      reason: 'The ban should be reviewed.'
    })
  });
  assert.equal(appealResponse.status, 201);
  const appealResult = await appealResponse.json();
  assert.equal(appealResult.appeal.status, 'open');

  const listAppeals = await fetch(`${baseUrl}/appeals`, {
    headers: { authorization: `Bearer ${juror.sessionToken}` }
  });
  assert.equal(listAppeals.status, 200);
  const { appeals } = await listAppeals.json();
  const listedAppeal = appeals.find((appeal) => appeal.id === appealResult.appeal.id);
  assert.equal(Boolean(listedAppeal), true);
  assert.equal(listedAppeal.reason, 'The ban should be reviewed.');

  const voteResponse = await fetch(`${baseUrl}/appeals/${appealResult.appeal.id}/votes`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${juror.sessionToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ decision: 'approve' })
  });
  assert.equal(voteResponse.status, 201);
  const voteResult = await voteResponse.json();
  assert.equal(voteResult.appeal.status, 'resolved');
  assert.equal(voteResult.appeal.resolution.action, 'restore_access');
  assert.equal(store.users.get(target.user.user_hash).banned, false);
  assert.equal(store.auditLog.some((event) => event.operation === 'appeal_decision'), true);
  assert.equal(store.auditLog.some((event) => event.operation === 'unban'), true);
});

test('restricts spaces by allowed email domain', async () => {
  const moderator = await signup('space-mod@example.edu', 'space_mod');
  const secondModerator = await signup('space-mod-2@example.edu', 'space_mod_2');
  const eduUser = await signup('space-edu@example.edu', 'space_edu');
  const orgUser = await signup('space-org@example.org', 'space_org');

  const moderatorUser = store.users.get(moderator.user.user_hash);
  moderatorUser.roles.push('moderator');
  store.persistUser(moderatorUser);
  const secondModeratorUser = store.users.get(secondModerator.user.user_hash);
  secondModeratorUser.roles.push('moderator');
  store.persistUser(secondModeratorUser);

  const createSpace = await fetch(`${baseUrl}/spaces`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${moderator.sessionToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      name: 'Example Org',
      allowed_domains: ['example.org']
    })
  });
  assert.equal(createSpace.status, 202);
  const pending = await createSpace.json();
  assert.equal(pending.approval_request.approvals_count, 1);

  const approvalList = await fetch(`${baseUrl}/approvals`, {
    headers: { authorization: `Bearer ${moderator.sessionToken}` }
  });
  assert.equal(approvalList.status, 200);
  const { approvals } = await approvalList.json();
  const listedApproval = approvals.find((approval) => approval.id === pending.approval_request.id);
  assert.deepEqual(listedApproval.payload, {
    name: 'Example Org',
    allowed_domains: ['example.org']
  });

  const approveSpace = await fetch(`${baseUrl}/spaces`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${secondModerator.sessionToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      name: 'Example Org',
      allowed_domains: ['example.org']
    })
  });
  assert.equal(approveSpace.status, 201);
  const { space, approval_request: approvalRequest } = await approveSpace.json();
  assert.equal(approvalRequest.status, 'approved');
  assert.equal(approvalRequest.approvals_count, 2);

  const deniedPost = await fetch(`${baseUrl}/posts`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${eduUser.sessionToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      space_id: space.id,
      content: 'I should not be able to post here.'
    })
  });
  assert.equal(deniedPost.status, 403);

  const allowedPost = await fetch(`${baseUrl}/posts`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${orgUser.sessionToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      space_id: space.id,
      content: 'Visible only to example.org.'
    })
  });
  assert.equal(allowedPost.status, 201);
  const { post } = await allowedPost.json();

  const publicList = await fetch(`${baseUrl}/posts?space_id=${space.id}`);
  const publicPosts = await publicList.json();
  assert.equal(publicPosts.posts.some((visiblePost) => visiblePost.id === post.id), false);

  const orgList = await fetch(`${baseUrl}/posts?space_id=${space.id}`, {
    headers: { authorization: `Bearer ${orgUser.sessionToken}` }
  });
  const orgPosts = await orgList.json();
  assert.equal(orgPosts.posts.some((visiblePost) => visiblePost.id === post.id), true);
  assert.equal(store.auditLog.some((event) => event.operation === 'approval_resolved'), true);
});

test('allows moderators to ban users and read audit events', async () => {
  const moderator = await signup('audit-mod@example.edu', 'audit_mod');
  const target = await signup('audit-target@example.edu', 'audit_target');

  const moderatorUser = store.users.get(moderator.user.user_hash);
  moderatorUser.roles.push('moderator');
  store.persistUser(moderatorUser);

  const banResponse = await fetch(`${baseUrl}/moderation/ban`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${moderator.sessionToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      user_hash: target.user.user_hash,
      reason: 'Audit test ban'
    })
  });
  assert.equal(banResponse.status, 201);
  assert.equal(store.users.get(target.user.user_hash).banned, true);

  const auditResponse = await fetch(`${baseUrl}/moderation/audit-log`, {
    headers: { authorization: `Bearer ${moderator.sessionToken}` }
  });
  assert.equal(auditResponse.status, 200);
  const { audit_log: auditLog } = await auditResponse.json();
  assert.equal(auditLog.some((event) => {
    return event.operation === 'ban'
      && event.target_hash === target.user.user_hash
      && event.reason === 'Audit test ban';
  }), true);

  const publicAuditResponse = await fetch(`${baseUrl}/audit-log`);
  assert.equal(publicAuditResponse.status, 200);
  const { audit_log: publicAuditLog } = await publicAuditResponse.json();
  const publicBan = publicAuditLog.find((event) => event.operation === 'ban' && event.reason === 'Audit test ban');
  assert.notEqual(publicBan, undefined);
  assert.equal(Object.hasOwn(publicBan, 'actor_hash'), false);
  assert.equal(Object.hasOwn(publicBan, 'target_hash'), false);
  assert.match(publicBan.actor_ref, /^[a-f0-9]{12}$/);
  assert.match(publicBan.target_ref, /^[a-f0-9]{12}$/);
  assert.notEqual(publicBan.target_ref, target.user.user_hash);
});

test('prevents direct moderator bans against protected users and self', async () => {
  const moderator = await signup('safeguard-mod@example.edu', 'safeguard_mod');
  const protectedTarget = await signup('safeguard-target@example.edu', 'safeguard_target');

  const moderatorUser = store.users.get(moderator.user.user_hash);
  moderatorUser.roles.push('moderator');
  store.persistUser(moderatorUser);

  const protectedUser = store.users.get(protectedTarget.user.user_hash);
  protectedUser.roles.push('moderator');
  store.persistUser(protectedUser);

  const selfBan = await fetch(`${baseUrl}/moderation/ban`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${moderator.sessionToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      user_hash: moderator.user.user_hash,
      reason: 'self ban should fail'
    })
  });
  assert.equal(selfBan.status, 400);
  const selfBanBody = await selfBan.json();
  assert.equal(selfBanBody.error, 'cannot_ban_self');

  const protectedBan = await fetch(`${baseUrl}/moderation/ban`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${moderator.sessionToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      user_hash: protectedTarget.user.user_hash,
      reason: 'protected ban should require governance'
    })
  });
  assert.equal(protectedBan.status, 403);
  const protectedBanBody = await protectedBan.json();
  assert.equal(protectedBanBody.error, 'protected_user_requires_governance');
  assert.equal(protectedBanBody.required_approval_weight, 8);
  assert.equal(store.users.get(protectedTarget.user.user_hash).banned, false);
});
