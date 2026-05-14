import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGovernanceCaseService } from '../src/governance-case-service.js';

function fakeStore() {
  const moderationCases = new Map([
    ['case-open', {
      id: 'case-open',
      accused_hash: 'accused-user',
      juror_hashes: ['juror-user'],
      status: 'open',
      votes: [],
      created_at: '2026-05-14T00:01:00.000Z'
    }],
    ['case-old', {
      id: 'case-old',
      accused_hash: 'other-user',
      juror_hashes: [],
      status: 'open',
      votes: [],
      created_at: '2026-05-13T00:01:00.000Z'
    }]
  ]);
  const appealCases = new Map([
    ['appeal-open', {
      id: 'appeal-open',
      appellant_hash: 'appellant-user',
      status: 'open',
      votes: [],
      created_at: '2026-05-14T00:01:00.000Z'
    }]
  ]);

  return {
    moderationCases,
    appealCases,
    findOpenAppealCase(appellantHash, targetType, targetId) {
      return [...appealCases.values()].find((appealCase) => {
        return appealCase.appellant_hash === appellantHash
          && appealCase.target_type === targetType
          && appealCase.target_id === targetId
          && appealCase.status === 'open';
      }) || null;
    },
    createAppealCase(appellantHash, targetType, targetId, reason) {
      const appealCase = {
        id: `appeal-${appealCases.size + 1}`,
        appellant_hash: appellantHash,
        target_type: targetType,
        target_id: targetId,
        reason,
        status: 'open',
        votes: [],
        created_at: '2026-05-14T00:02:00.000Z'
      };
      appealCases.set(appealCase.id, appealCase);
      return appealCase;
    },
    addCaseVote(caseId, userHash, decision, action, weight) {
      const moderationCase = moderationCases.get(caseId);
      if (!moderationCase || moderationCase.status !== 'open') {
        return null;
      }
      if (moderationCase.votes.some((vote) => vote.voter_hash === userHash)) {
        return { duplicate: true, moderationCase };
      }
      moderationCase.votes.push({ voter_hash: userHash, decision, action, weight });
      return { duplicate: false, moderationCase };
    },
    addAppealVote(appealId, userHash, decision, weight) {
      const appealCase = appealCases.get(appealId);
      if (!appealCase || appealCase.status !== 'open') {
        return null;
      }
      if (appealCase.votes.some((vote) => vote.voter_hash === userHash)) {
        return { duplicate: true, appealCase };
      }
      appealCase.votes.push({ voter_hash: userHash, decision, weight });
      return { duplicate: false, appealCase };
    }
  };
}

test('lists and reads governance cases newest first', () => {
  const service = createGovernanceCaseService(fakeStore());

  assert.deepEqual(service.listCases().map((moderationCase) => moderationCase.id), ['case-open', 'case-old']);
  assert.equal(service.getCase('case-open').id, 'case-open');
  assert.equal(service.getCase('missing-case'), null);
});

test('validates case vote permissions and duplicate votes', () => {
  const service = createGovernanceCaseService(fakeStore());

  assert.deepEqual(service.addCaseVote({
    caseId: 'case-open',
    user: { user_hash: 'accused-user' },
    decision: 'dismiss',
    action: 'none',
    weight: 1
  }), { ok: false, status: 400, error: 'cannot_vote_on_own_case' });

  assert.deepEqual(service.addCaseVote({
    caseId: 'case-open',
    user: { user_hash: 'not-assigned' },
    decision: 'dismiss',
    action: 'none',
    weight: 1
  }), { ok: false, status: 403, error: 'juror_not_assigned' });

  const first = service.addCaseVote({
    caseId: 'case-open',
    user: { user_hash: 'juror-user' },
    decision: 'violation',
    action: 'hide_content',
    weight: 2
  });
  assert.equal(first.ok, true);

  assert.deepEqual(service.addCaseVote({
    caseId: 'case-open',
    user: { user_hash: 'juror-user' },
    decision: 'violation',
    action: 'hide_content',
    weight: 2
  }), { ok: false, status: 409, error: 'duplicate_vote' });
});

test('creates appeals and blocks duplicates', () => {
  const service = createGovernanceCaseService(fakeStore());
  const created = service.createAppeal({
    appellant: { user_hash: 'new-appellant' },
    targetType: 'user',
    targetId: 'target-user',
    reason: 'Please review'
  });
  assert.equal(created.ok, true);

  const duplicate = service.createAppeal({
    appellant: { user_hash: 'new-appellant' },
    targetType: 'user',
    targetId: 'target-user',
    reason: 'Please review again'
  });
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.error, 'duplicate_appeal');
});

test('validates appeal vote ownership and duplicates', () => {
  const service = createGovernanceCaseService(fakeStore());

  assert.deepEqual(service.addAppealVote({
    appealId: 'appeal-open',
    user: { user_hash: 'appellant-user' },
    decision: 'approve',
    weight: 1
  }), { ok: false, status: 400, error: 'cannot_vote_on_own_appeal' });

  const first = service.addAppealVote({
    appealId: 'appeal-open',
    user: { user_hash: 'juror-user' },
    decision: 'approve',
    weight: 2
  });
  assert.equal(first.ok, true);

  assert.deepEqual(service.addAppealVote({
    appealId: 'appeal-open',
    user: { user_hash: 'juror-user' },
    decision: 'approve',
    weight: 2
  }), { ok: false, status: 409, error: 'duplicate_vote' });
});
