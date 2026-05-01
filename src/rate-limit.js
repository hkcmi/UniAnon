import { createClient } from 'redis';
import { config } from './config.js';

class MemoryRateLimitStore {
  constructor() {
    this.buckets = new Map();
  }

  async increment(key, windowMs) {
    const now = Date.now();
    const existing = this.buckets.get(key);

    if (!existing || existing.reset_at <= now) {
      const bucket = {
        count: 1,
        reset_at: now + windowMs
      };
      this.buckets.set(key, bucket);
      return bucket;
    }

    existing.count += 1;
    return existing;
  }
}

class RedisRateLimitStore {
  constructor(redisUrl) {
    this.client = createClient({ url: redisUrl });
    this.client.on('error', (error) => {
      console.error(`Redis rate limiter error: ${error.message}`);
    });
    this.connectPromise = this.client.connect();
  }

  async increment(key, windowMs) {
    await this.connectPromise;
    const count = await this.client.incr(key);

    if (count === 1) {
      await this.client.pExpire(key, windowMs);
      return {
        count,
        reset_at: Date.now() + windowMs
      };
    }

    const ttl = await this.client.pTTL(key);
    return {
      count,
      reset_at: Date.now() + Math.max(ttl, 0)
    };
  }
}

export function createRateLimiter(options = {}) {
  const redisUrl = options.redisUrl ?? config.redisUrl;
  const limits = options.limits || config.rateLimits;
  const store = options.store || (redisUrl ? new RedisRateLimitStore(redisUrl) : new MemoryRateLimitStore());

  return {
    store,

    async consume(limitName, subject) {
      const limit = limits[limitName];
      if (!limit) {
        throw new Error(`Unknown rate limit: ${limitName}`);
      }

      const key = `rate:${limitName}:${subject}`;
      const bucket = await store.increment(key, limit.windowMs);
      const remaining = Math.max(limit.max - bucket.count, 0);
      const retryAfter = Math.max(Math.ceil((bucket.reset_at - Date.now()) / 1000), 1);

      return {
        allowed: bucket.count <= limit.max,
        count: bucket.count,
        max: limit.max,
        remaining,
        retry_after: retryAfter,
        reset_at: bucket.reset_at
      };
    }
  };
}
