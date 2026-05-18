/**
 * ⚠️ SAMPLE / DEMO CODE — NOT FOR PRODUCTION ⚠️
 *
 * Always returns the same hardcoded user — useful for boot smoke tests
 * only. Production adapters must verify the token signature and look
 * up the user from an IdP or local store.
 */
import { Injectable } from '@nestjs/common';
import { AuthAdapterInterface, AuthorizedUser } from '@bitwild/rockets';

@Injectable()
export class MockAuthAdapter implements AuthAdapterInterface {
  async validateToken(_token: string): Promise<AuthorizedUser> {
    return {
      id: 'mock-user-id',
      sub: 'mock-user-sub',
      email: 'mock@example.com',
      userRoles: [{ role: { name: 'user' } }],
      claims: {},
    };
  }
}
