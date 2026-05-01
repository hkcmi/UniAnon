import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRateLimiter } from '../src/rate-limit.js';

test('memory rate limiter blocks requests after the configured quota', async () => {
  const limiter = createRateLimiter({
    redisUrl: '',
    limits: {
      testLimit: {
        windowMs: 60 * 1000,
        max: 2
      }
    }
  });

  const first = await limiter.consume('testLimit', 'subject-a');
  const second = await limiter.consume('testLimit', 'subject-a');
  const third = await limiter.consume('testLimit', 'subject-a');

  assert.equal(first.allowed, true);
  assert.equal(first.remaining, 1);
  assert.equal(second.allowed, true);
  assert.equal(second.remaining, 0);
  assert.equal(third.allowed, false);
  assert.equal(third.retry_after > 0, true);
});
