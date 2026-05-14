import { config } from './config.js';
import { createMailer } from './mailer.js';
import { createOidcStateStore } from './oidc-state-store.js';
import { createRateLimiter } from './rate-limit.js';
import { createSessionService } from './session-service.js';
import { createStore } from './store.js';

export function createServices(options = {}) {
  const store = options.store || createStore(options.storeOptions || {});

  return {
    store,
    rateLimiter: options.rateLimiter || createRateLimiter(options.rateLimiterOptions || {}),
    mailer: options.mailer || createMailer(options.mailerOptions || {}),
    oidcStateStore: options.oidcStateStore || createOidcStateStore({
      ttlMs: options.oidcStateTtlMs || config.oidc.stateTtlMs
    }),
    sessionService: options.sessionService || createSessionService(store)
  };
}
