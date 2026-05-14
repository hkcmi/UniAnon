import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSpaceService, normalizeSpaceRequest, serializeSpace, validateSpaceName } from '../src/space-service.js';

test('validates and normalizes space creation requests', () => {
  assert.equal(validateSpaceName(' A'), null);
  assert.equal(validateSpaceName(' Campus '), 'Campus');

  assert.deepEqual(normalizeSpaceRequest({
    name: ' Org Space ',
    allowed_domains: ['Example.ORG', 'example.org', 'example.edu']
  }, ['example.edu', 'example.org']), {
    payload: {
      name: 'Org Space',
      allowed_domains: ['example.edu', 'example.org']
    }
  });

  assert.deepEqual(normalizeSpaceRequest({ name: '', allowed_domains: [] }, ['example.edu']), {
    error: 'invalid_space_name'
  });
  assert.deepEqual(normalizeSpaceRequest({ name: 'Private', allowed_domains: ['blocked.test'] }, ['example.edu']), {
    error: 'domain_not_allowed',
    domain: 'blocked.test'
  });
});

test('lists only spaces accessible to the current user', () => {
  const service = createSpaceService({
    spaces: new Map([
      ['public', { id: 'public', name: 'Public', allowed_domains: [], created_at: '2026-05-14T00:00:00.000Z' }],
      ['edu', { id: 'edu', name: 'Edu', allowed_domains: ['example.edu'], created_at: '2026-05-14T00:01:00.000Z' }],
      ['org', { id: 'org', name: 'Org', allowed_domains: ['example.org'], created_at: '2026-05-14T00:02:00.000Z' }]
    ])
  });

  assert.deepEqual(service.listAccessibleSpaces(null).map((space) => space.id), ['public']);
  assert.deepEqual(service.listAccessibleSpaces({ domain_group: 'example.edu' }).map((space) => space.id), ['public', 'edu']);
});

test('creates spaces through the store boundary', () => {
  const created = [];
  const service = createSpaceService({
    spaces: new Map(),
    createSpace(name, allowedDomains) {
      const space = {
        id: `space-${created.length + 1}`,
        name,
        allowed_domains: allowedDomains,
        created_at: '2026-05-14T00:00:00.000Z'
      };
      created.push(space);
      return space;
    }
  });

  assert.deepEqual(service.createSpace({ name: 'Private', allowed_domains: ['example.edu'] }), serializeSpace(created[0]));
});
