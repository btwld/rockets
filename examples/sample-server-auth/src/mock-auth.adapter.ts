/**
 * ⚠️ SAMPLE / DEMO CODE — NOT FOR PRODUCTION ⚠️
 *
 * Always returns the same hardcoded user — useful for boot smoke tests
 * only. Production adapters must verify the token signature and look
 * up the user from an IdP or local store.
 */
import { Injectable } from '@nestjs/common';
import type {
  AuthAdapterInterface,
  AuthAttemptResult,
  AuthRequest,
} from '@bitwild/rockets';
import { extractBearerToken } from '@bitwild/rockets';

@Injectable()
export class MockAuthAdapter implements AuthAdapterInterface {
  async authenticate(request: AuthRequest): Promise<AuthAttemptResult> {
    const token = extractBearerToken(request);
    if (token === null) return { matched: false };

    return {
      matched: true,
      user: {
        id: 'mock-user-id',
        sub: 'mock-user-sub',
        email: 'mock@example.com',
        userRoles: [{ role: { name: 'user' } }],
        claims: {},
      },
    };
  }
}
