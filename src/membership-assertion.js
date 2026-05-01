import crypto from 'node:crypto';
import { nanoid } from 'nanoid';
import { config } from './config.js';

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function decode(value) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

function sign(unsigned, secret) {
  return crypto.createHmac('sha256', secret).update(unsigned).digest('base64url');
}

export function createMembershipAssertion({ subjectHash, domainGroup, nullifier }, options = {}) {
  const now = Date.now();
  const payload = {
    typ: 'unianon.membership',
    sub: subjectHash,
    nullifier,
    domain_group: domainGroup,
    iat: now,
    exp: now + (options.ttlMs || config.membershipAssertionTtlMs),
    jti: nanoid(16)
  };
  const encodedPayload = encode(payload);
  const signature = sign(encodedPayload, options.secret || config.membershipAssertionSecret);
  return `${encodedPayload}.${signature}`;
}

export function verifyMembershipAssertion(assertion, options = {}) {
  if (typeof assertion !== 'string') {
    return null;
  }

  const parts = assertion.split('.');
  if (parts.length !== 2) {
    return null;
  }

  const [encodedPayload, signature] = parts;
  const expected = sign(encodedPayload, options.secret || config.membershipAssertionSecret);
  const actual = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (actual.length !== expectedBuffer.length || !crypto.timingSafeEqual(actual, expectedBuffer)) {
    return null;
  }

  const payload = decode(encodedPayload);
  if (payload.typ !== 'unianon.membership') {
    return null;
  }

  if (!payload.sub || !payload.nullifier || !payload.domain_group || payload.exp <= Date.now()) {
    return null;
  }

  return payload;
}
