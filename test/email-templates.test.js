import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderMagicLinkEmail } from '../src/email-templates.js';

test('renders text and html magic link email', () => {
  const email = renderMagicLinkEmail({
    magicLink: 'https://example.test/login?token=abc123',
    expiresInMinutes: 15
  });

  assert.equal(email.subject, 'Your UniAnon magic link');
  assert.match(email.text, /expires in 15 minutes/);
  assert.match(email.text, /https:\/\/example\.test\/login\?token=abc123/);
  assert.match(email.html, /Sign in to UniAnon/);
  assert.match(email.html, /href="https:\/\/example\.test\/login\?token=abc123"/);
});

test('escapes html-sensitive magic link values', () => {
  const email = renderMagicLinkEmail({
    magicLink: 'https://example.test/login?token=<script>',
    expiresInMinutes: '<15>'
  });

  assert.match(email.html, /&lt;script&gt;/);
  assert.match(email.html, /&lt;15&gt;/);
  assert.doesNotMatch(email.html, /token=<script>/);
});
