import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { createStore } from '../src/store.js';

test('persists core community data across store restarts', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unianon-store-'));
  const databasePath = path.join(dir, 'unianon.sqlite');

  const firstStore = createStore({ databasePath });
  const user = firstStore.upsertUser('stable-user-hash', 'example.edu', 'stable-nullifier');
  assert.equal(firstStore.setNickname(user.user_hash, 'persistent_user'), true);

  const space = firstStore.createSpace('Persistent Space', ['example.edu']);
  const post = firstStore.createPost(user.user_hash, space.id, 'This post should survive restart.');
  firstStore.createComment(post.id, user.user_hash, 'So should this comment.');
  firstStore.logAuthEvent({
    eventType: 'magic_link_requested',
    emailDigest: 'a'.repeat(64),
    domainGroup: 'example.edu',
    success: true,
    reason: 'sent'
  });
  const appealCase = firstStore.createAppealCase(user.user_hash, 'user', user.user_hash, 'Please review.');
  firstStore.addAppealVote(appealCase.id, 'juror-hash', 'approve', 3);
  const approvalRequest = firstStore.createApprovalRequest('create_space', {
    name: 'Approval Space',
    allowed_domains: ['example.edu']
  }, user.user_hash);
  firstStore.approveRequest(approvalRequest.id, 'second-approver');
  firstStore.close();

  const secondStore = createStore({ databasePath });
  assert.equal(secondStore.users.get(user.user_hash).nickname, 'persistent_user');
  assert.equal(secondStore.nullifiers.get('stable-nullifier'), user.user_hash);
  assert.equal(secondStore.spaces.get(space.id).name, 'Persistent Space');
  assert.equal(secondStore.posts.get(post.id).content, 'This post should survive restart.');
  assert.equal([...secondStore.comments.values()][0].content, 'So should this comment.');
  assert.equal(secondStore.authEvents[0].email_digest, 'a'.repeat(64));
  assert.equal(secondStore.appealCases.get(appealCase.id).votes[0].decision, 'approve');
  assert.equal(secondStore.approvalRequests.get(approvalRequest.id).approvals.length, 2);
  secondStore.close();

  fs.rmSync(dir, { recursive: true, force: true });
});

test('records applied schema migrations', () => {
  const store = createStore({ databasePath: ':memory:' });
  const migrations = store.db.prepare('SELECT version, name FROM schema_migrations ORDER BY version').all();

  assert.deepEqual(migrations.map((migration) => migration.version), [1, 2, 3, 4, 5]);
  assert.deepEqual(migrations.map((migration) => migration.name), [
    'initial_schema',
    'hashed_sessions',
    'user_nullifiers',
    'privacy_preserving_magic_tokens',
    'moderation_jury_assignments'
  ]);

  store.close();
});

test('upgrades legacy tables through versioned migrations', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unianon-legacy-store-'));
  const databasePath = path.join(dir, 'legacy.sqlite');
  const legacyDb = new DatabaseSync(databasePath);
  legacyDb.exec(`
    CREATE TABLE users (
      user_hash TEXT PRIMARY KEY,
      nickname TEXT UNIQUE,
      domain_group TEXT NOT NULL,
      trust_level INTEGER NOT NULL DEFAULT 0,
      roles TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      banned INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE sessions (
      token TEXT,
      user_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE magic_tokens (
      token TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      domain_group TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE moderation_cases (
      id TEXT PRIMARY KEY,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      accused_hash TEXT NOT NULL,
      report_ids TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL,
      votes TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      resolved_at TEXT,
      resolution TEXT
    );
  `);
  legacyDb.prepare(`
    INSERT INTO users (user_hash, nickname, domain_group, trust_level, roles, created_at, banned)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('legacy-user', 'legacy_user', 'example.edu', 1, '[]', new Date().toISOString(), 0);
  legacyDb.prepare('INSERT INTO sessions (token, user_hash, created_at) VALUES (?, ?, ?)')
    .run('legacy-session-token', 'legacy-user', new Date().toISOString());
  legacyDb.close();

  const store = createStore({ databasePath });
  const userColumns = store.db.prepare('PRAGMA table_info(users)').all().map((column) => column.name);
  const sessionColumns = store.db.prepare('PRAGMA table_info(sessions)').all().map((column) => column.name);
  const magicTokenColumns = store.db.prepare('PRAGMA table_info(magic_tokens)').all().map((column) => column.name);
  const caseColumns = store.db.prepare('PRAGMA table_info(moderation_cases)').all().map((column) => column.name);
  const sessionRow = store.db.prepare('SELECT token, token_hash, expires_at FROM sessions').get();

  assert.equal(userColumns.includes('nullifier'), true);
  assert.equal(store.users.get('legacy-user').nullifier, 'legacy-user');
  assert.equal(sessionColumns.includes('token_hash'), true);
  assert.equal(sessionColumns.includes('expires_at'), true);
  assert.equal(sessionRow.token, null);
  assert.equal(typeof sessionRow.token_hash, 'string');
  assert.equal(sessionRow.token_hash.length, 64);
  assert.equal(magicTokenColumns.includes('email'), false);
  assert.equal(magicTokenColumns.includes('subject_hash'), true);
  assert.equal(magicTokenColumns.includes('nullifier'), true);
  assert.equal(caseColumns.includes('juror_hashes'), true);
  assert.deepEqual(
    store.db.prepare('SELECT version FROM schema_migrations ORDER BY version').all().map((row) => row.version),
    [1, 2, 3, 4, 5]
  );
  store.close();

  fs.rmSync(dir, { recursive: true, force: true });
});

test('reuses an existing user when the nullifier already exists', () => {
  const store = createStore({ databasePath: ':memory:' });
  const first = store.upsertUser('public-user-a', 'example.edu', 'member-nullifier');
  const second = store.upsertUser('public-user-b', 'example.edu', 'member-nullifier');

  assert.equal(second.user_hash, first.user_hash);
  assert.equal(store.users.size, 1);
  assert.equal(store.nullifiers.get('member-nullifier'), 'public-user-a');

  store.close();
});

test('calculates trust level from account age, content, and violations', () => {
  const store = createStore({ databasePath: ':memory:' });
  const user = store.upsertUser('trust-user', 'example.edu', 'trust-nullifier');
  user.created_at = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
  store.persistUser(user);

  const space = store.spaces.get('public');
  const firstPost = store.createPost(user.user_hash, space.id, 'Useful post 1');
  store.createPost(user.user_hash, space.id, 'Useful post 2');
  store.createComment(firstPost.id, user.user_hash, 'Useful comment');

  assert.equal(store.users.get(user.user_hash).trust_level, 3);
  assert.deepEqual(store.getTrustMetrics(user.user_hash).visible_content, 3);

  const report = store.createReport('reporter-hash', 'post', firstPost.id, 'Confirmed issue', 3).report;
  const moderationCase = store.createModerationCase('post', firstPost.id, user.user_hash, [report.id]);
  store.resolveCase(moderationCase.id, {
    decision: 'violation',
    action: 'hide_content',
    reason: 'confirmed by test'
  });

  assert.equal(store.users.get(user.user_hash).trust_level, 1);
  assert.equal(store.getTrustMetrics(user.user_hash).upheld_violations, 1);

  store.close();
});
