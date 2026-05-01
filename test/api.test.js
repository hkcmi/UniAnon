import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
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
  assert.equal(appeals.some((appeal) => appeal.id === appealResult.appeal.id), true);

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
  const eduUser = await signup('space-edu@example.edu', 'space_edu');
  const orgUser = await signup('space-org@example.org', 'space_org');

  store.users.get(moderator.user.user_hash).roles.push('moderator');

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
  assert.equal(createSpace.status, 201);
  const { space } = await createSpace.json();

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
