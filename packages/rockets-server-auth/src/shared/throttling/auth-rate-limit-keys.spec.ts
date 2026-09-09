import { describe, expect, it } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';

import {
  authAccountRateLimitKey,
  authIpRateLimitKey,
  authUserRateLimitKey,
} from './auth-rate-limit-keys';

function contextFor(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        ip: '1.2.3.4',
        method: 'POST',
        route: { path: '/token/password' },
        ...request,
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('authAccountRateLimitKey', () => {
  // Guards run before pipes, so the body carries whatever the client
  // sent. A field this route does not authenticate with must not be able
  // to key the counter: rotating it per request would leave the fine
  // limit counting one attempt per key.
  it('ignores a field the route did not declare', () => {
    const key = authAccountRateLimitKey(['username']);
    const first = key(
      contextFor({ body: { username: 'victim', email: 'decoy-1@x.com' } }),
    );
    const second = key(
      contextFor({ body: { username: 'victim', email: 'decoy-2@x.com' } }),
    );

    expect(first).toEqual(second);
    expect(first).toEqual(['POST:/token/password:1.2.3.4::username:victim']);
  });

  it('counts one key per declared field present', () => {
    const key = authAccountRateLimitKey(['email', 'username']);
    expect(
      key(contextFor({ body: { username: 'u', email: 'E@X.com' } })),
    ).toEqual([
      'POST:/token/password:1.2.3.4::email:e@x.com',
      'POST:/token/password:1.2.3.4::username:u',
    ]);
  });

  // The safe default for a route that names nothing — including a route
  // added later by someone who does not know this trap exists.
  it('falls back to the IP key when no declared field is present', () => {
    expect(
      authAccountRateLimitKey(['username'])(contextFor({ body: {} })),
    ).toEqual(['POST:/token/password:1.2.3.4']);
    expect(
      authAccountRateLimitKey([])(contextFor({ body: { email: 'x@y.z' } })),
    ).toEqual(['POST:/token/password:1.2.3.4']);
  });

  it('bounds a long account value with a hash', () => {
    const long = `${'a'.repeat(200)}@example.com`;
    const [key] = authAccountRateLimitKey(['email'])(
      contextFor({ body: { email: long } }),
    );
    expect(key).toMatch(/::email:h:[0-9a-f]{64}$/);
  });
});

describe('authUserRateLimitKey', () => {
  it('keys on the authenticated actor', () => {
    expect(authUserRateLimitKey(contextFor({ user: { id: 'user-1' } }))).toBe(
      'POST:/token/password:user:user-1',
    );
  });

  // A misordered guard chain limits per IP rather than sharing one key.
  it('falls back to the IP with no actor', () => {
    expect(authUserRateLimitKey(contextFor({}))).toBe(
      'POST:/token/password:1.2.3.4',
    );
    expect(authIpRateLimitKey(contextFor({}))).toBe(
      'POST:/token/password:1.2.3.4',
    );
  });
});
