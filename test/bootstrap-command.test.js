import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { createStore } from '../src/store.js';

const execFileAsync = promisify(execFile);

function commandEnv(databasePath) {
  return {
    ...process.env,
    DATABASE_PATH: databasePath
  };
}

async function withDatabase(prefix, callback) {
  const tempDir = await mkdtemp(path.join(tmpdir(), prefix));
  const databasePath = path.join(tempDir, 'unianon.sqlite');

  try {
    return await callback(databasePath);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function createUser(databasePath, { userHash, nickname, banned = false, roles = [] }) {
  const store = createStore({ databasePath });
  const user = store.upsertUser(userHash, 'example.edu', `${userHash}-nullifier`);
  store.setNickname(user.user_hash, nickname);
  user.banned = banned;
  user.roles = roles;
  store.persistUser(user);
  store.close();
}

function readUser(databasePath, userHash) {
  const store = createStore({ databasePath });
  const user = store.users.get(userHash);
  store.close();
  return user;
}

test('bootstrap command promotes the first system admin by nickname', async () => {
  await withDatabase('unianon-bootstrap-test-', async (databasePath) => {
    createUser(databasePath, {
      userHash: 'bootstrap-target',
      nickname: 'bootstrap_target'
    });

    const { stdout } = await execFileAsync(process.execPath, ['scripts/bootstrap-system-admin.js', '--nickname', 'bootstrap_target'], {
      cwd: process.cwd(),
      env: commandEnv(databasePath)
    });

    const user = readUser(databasePath, 'bootstrap-target');
    assert.match(stdout, /Bootstrapped system_admin/);
    assert.equal(user.roles.includes('system_admin'), true);
  });
});

test('bootstrap command refuses to run after a system admin exists', async () => {
  await withDatabase('unianon-bootstrap-existing-test-', async (databasePath) => {
    createUser(databasePath, {
      userHash: 'existing-admin',
      nickname: 'existing_admin',
      roles: ['system_admin']
    });
    createUser(databasePath, {
      userHash: 'second-target',
      nickname: 'second_target'
    });

    await assert.rejects(
      execFileAsync(process.execPath, ['scripts/bootstrap-system-admin.js', '--nickname', 'second_target'], {
        cwd: process.cwd(),
        env: commandEnv(databasePath)
      }),
      (error) => {
        assert.match(error.stderr, /system_admin already exists/);
        return true;
      }
    );

    const user = readUser(databasePath, 'second-target');
    assert.equal(user.roles.includes('system_admin'), false);
  });
});

test('bootstrap command refuses missing and banned target users', async () => {
  await withDatabase('unianon-bootstrap-invalid-test-', async (databasePath) => {
    createUser(databasePath, {
      userHash: 'banned-target',
      nickname: 'banned_target',
      banned: true
    });

    await assert.rejects(
      execFileAsync(process.execPath, ['scripts/bootstrap-system-admin.js', '--nickname', 'missing_target'], {
        cwd: process.cwd(),
        env: commandEnv(databasePath)
      }),
      (error) => {
        assert.match(error.stderr, /Target user not found/);
        return true;
      }
    );

    await assert.rejects(
      execFileAsync(process.execPath, ['scripts/bootstrap-system-admin.js', '--user-hash', 'banned-target'], {
        cwd: process.cwd(),
        env: commandEnv(databasePath)
      }),
      (error) => {
        assert.match(error.stderr, /Cannot bootstrap a banned user/);
        return true;
      }
    );

    const user = readUser(databasePath, 'banned-target');
    assert.equal(user.roles.includes('system_admin'), false);
  });
});
