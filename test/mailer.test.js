import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMailer } from '../src/mailer.js';

test('dev mailer returns magic token for local login', async () => {
  const mailer = createMailer({ delivery: 'dev' });
  const result = await mailer.sendMagicLink('person@example.edu', 'dev-token');

  assert.equal(result.delivery, 'dev_response');
  assert.equal(result.token, 'dev-token');
  assert.match(result.magic_link, /token=dev-token/);
});

test('smtp mailer sends email without returning the token', async () => {
  const sentMessages = [];
  const mailer = createMailer({
    delivery: 'smtp',
    transport: {
      async sendMail(message) {
        sentMessages.push(message);
      }
    }
  });

  const result = await mailer.sendMagicLink('person@example.edu', 'smtp-token');

  assert.deepEqual(result, { delivery: 'smtp' });
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].to, 'person@example.edu');
  assert.match(sentMessages[0].text, /token=smtp-token/);
});
