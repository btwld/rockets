import { Injectable } from '@nestjs/common';
import { AuthProviderInterface, AuthorizedUser } from '@bitwild/rockets';

@Injectable()
export class MockAuthProvider implements AuthProviderInterface {
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
