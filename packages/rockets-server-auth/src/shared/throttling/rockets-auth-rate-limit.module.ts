import { Global, Module, type DynamicModule } from '@nestjs/common';
import {
  InMemoryRateLimitStore,
  RATE_LIMIT_DEFAULTS_TOKEN,
  RATE_LIMIT_MAX_KEYS_TOKEN,
  RATE_LIMIT_STORE_TOKEN,
  RateLimitGuard,
  type RateLimitDefaults,
} from '@concepta/rockets-core';

import type { RocketsAuthThrottlingOptions } from '../interfaces/rockets-auth-throttling-options.interface';
import { authIpRateLimitKey } from './auth-rate-limit-keys';

/**
 * Registers core's rate-limit port for the auth routes — the successor
 * of the `ThrottlerModule.forRoot` registration (upstream
 * `@nestjs/throttler` caps its peers at Nest 11 and made
 * `npm install @concepta/rockets-auth` unresolvable on Nest 12).
 *
 * `@Global()` for the same reason `ThrottlerModule` is: the guard is
 * applied with `@UseGuards(RateLimitGuard)` on controllers declared in
 * several feature sub-modules, and an enhancer class resolves its
 * dependencies from the injector of the module that declares the
 * controller. The tokens are core's canonical ones, provided HERE — which
 * makes `throttling.store` (and `throttling.maxKeys`) the way to change
 * the store the auth routes use. An app that ALSO registers
 * `RATE_LIMIT_STORE_TOKEN` does not replace it: a module resolves its own
 * imports before the global registry, so every controller declared by the
 * Rockets Auth module, and every sub-module that imports this
 * registration, reads this store. The exception is a controller generated
 * by `CrudModule.forFeature` (`/signup`): upstream declares it in a module
 * of its own that takes neither `imports` nor `providers`, so its guard
 * can only see the global registry — where the FIRST global registration
 * wins. Do not register the token in a `@Global()` module alongside
 * Rockets Auth; pass `throttling.store`. Pinned by
 * `rockets-auth-rate-limit-store.e2e-spec.ts`.
 *
 * Defaults preserve the previous engine's behaviour exactly:
 * a 1000/min per-IP ceiling no route overrides, and a 1000/min fine
 * dimension the auth routes tighten with `@RateLimit({ default: { … } })`
 * — per IP unless the route names the account fields it authenticates
 * with, which is what makes it per-`(ip, account)`. `throttling: false` disables the
 * guard while keeping every provider resolvable, so `@UseGuards`
 * references never dangle.
 */
@Global()
@Module({})
export class RocketsAuthRateLimitModule {
  static forRoot(
    throttling: false | RocketsAuthThrottlingOptions | undefined,
  ): DynamicModule {
    const defaults = buildAuthRateLimitDefaults(throttling);
    const options =
      throttling === false || throttling === undefined ? undefined : throttling;
    const store = options?.store ?? InMemoryRateLimitStore;

    return {
      module: RocketsAuthRateLimitModule,
      providers: [
        { provide: RATE_LIMIT_DEFAULTS_TOKEN, useValue: defaults },
        // The store is constructed in THIS module's injector, so its own
        // `@Optional()` dependencies resolve here — `maxKeys` has to be
        // provided alongside it or the default store is uncapped at
        // whatever core's constant says, with no way in from options.
        {
          provide: RATE_LIMIT_MAX_KEYS_TOKEN,
          useValue: options?.maxKeys,
        },
        { provide: RATE_LIMIT_STORE_TOKEN, useClass: store },
        RateLimitGuard,
      ],
      // `RATE_LIMIT_MAX_KEYS_TOKEN` is deliberately NOT exported: the only
      // thing that reads it is the store constructed in this module, and
      // this module is `@Global()`, so exporting the token would publish
      // it app-wide for nothing (AGENTS.md rule 14 — export the minimum).
      exports: [
        RATE_LIMIT_DEFAULTS_TOKEN,
        RATE_LIMIT_STORE_TOKEN,
        RateLimitGuard,
      ],
    };
  }
}

function buildAuthRateLimitDefaults(
  throttling: false | RocketsAuthThrottlingOptions | undefined,
): RateLimitDefaults {
  if (throttling === false) {
    return { disabled: true };
  }
  return {
    dimensions: {
      ip: {
        limit: throttling?.ip?.limit ?? 1000,
        windowMs: throttling?.ip?.windowMs ?? 60_000,
        key: authIpRateLimitKey,
      },
      // Per IP by DEFAULT. A route that authenticates an account narrows
      // this to `(ip, account)` by naming its own body fields
      // (`authAccountRateLimitKey([...])`) — see there for why the field
      // list cannot be global.
      default: {
        limit: throttling?.default?.limit ?? 1000,
        windowMs: throttling?.default?.windowMs ?? 60_000,
        key: authIpRateLimitKey,
      },
    },
  };
}
