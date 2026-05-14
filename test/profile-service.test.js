import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createProfileService, validateNickname } from '../src/profile-service.js';

test('validates safe nicknames and rejects reserved or url-like names', () => {
  assert.equal(validateNickname(' quiet_user '), 'quiet_user');
  assert.equal(validateNickname('ab'), null);
  assert.equal(validateNickname('admin'), null);
  assert.equal(validateNickname('www_user'), null);
  assert.equal(validateNickname('bad space'), null);
});

test('sets nickname and returns only public user fields', () => {
  const user = {
    user_hash: 'user-hash',
    nickname: null,
    domain_group: 'example.edu',
    trust_level: 1,
    roles: [],
    banned: false,
    nullifier: 'secret-nullifier'
  };
  const service = createProfileService({
    setNickname(userHash, nickname) {
      assert.equal(userHash, 'user-hash');
      user.nickname = nickname;
      return true;
    }
  });

  const result = service.setNickname(user, 'quiet_user');
  const json = JSON.stringify(result);

  assert.equal(result.ok, true);
  assert.equal(result.user.nickname, 'quiet_user');
  assert.equal(json.includes('nullifier'), false);
  assert.equal(json.includes('email'), false);
});

test('reports unavailable nicknames through the service boundary', () => {
  const service = createProfileService({
    setNickname() {
      return false;
    }
  });

  assert.deepEqual(service.setNickname({ user_hash: 'user-hash' }, 'taken'), {
    ok: false,
    status: 409,
    error: 'nickname_unavailable_or_already_set'
  });
});
