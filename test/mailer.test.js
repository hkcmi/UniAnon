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
  assert.match(sentMessages[0].html, /token=smtp-token/);
});

test('sendgrid mailer posts email without returning the token', async () => {
  const requests = [];
  const mailer = createMailer({
    delivery: 'sendgrid',
    sendgrid: {
      apiKey: 'test-sendgrid-key',
      apiUrl: 'https://sendgrid.test/v3/mail/send'
    },
    async fetch(url, request) {
      requests.push({ url, request });
      return { ok: true, status: 202 };
    }
  });

  const result = await mailer.sendMagicLink('person@example.edu', 'sendgrid-token');

  assert.deepEqual(result, { delivery: 'sendgrid' });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://sendgrid.test/v3/mail/send');
  assert.equal(requests[0].request.headers.authorization, 'Bearer test-sendgrid-key');

  const body = JSON.parse(requests[0].request.body);
  assert.equal(body.personalizations[0].to[0].email, 'person@example.edu');
  assert.match(body.content[0].value, /token=sendgrid-token/);
  assert.match(body.content[1].value, /token=sendgrid-token/);
});

test('sendgrid mailer requires an API key', async () => {
  const mailer = createMailer({
    delivery: 'sendgrid',
    sendgrid: {
      apiKey: '',
      apiUrl: 'https://sendgrid.test/v3/mail/send'
    },
    async fetch() {
      throw new Error('fetch should not be called');
    }
  });

  await assert.rejects(
    () => mailer.sendMagicLink('person@example.edu', 'sendgrid-token'),
    /SENDGRID_API_KEY/
  );
});
