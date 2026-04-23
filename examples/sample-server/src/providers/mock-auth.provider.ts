import { Injectable } from '@nestjs/common';
import { AuthProviderInterface, AuthorizedUser } from '@bitwild/rockets';

const MOCK_USERS: Record<string, AuthorizedUser> = {
  'token-1': {
    id: 'user-123',
    sub: 'user-123',
    email: 'user1@example.com',
    userRoles: [{ role: { name: 'user' } }],
    claims: { token: 'token-1', provider: 'mock' },
  },
  'token-2': {
    id: 'user-456',
    sub: 'user-456',
    email: 'user2@example.com',
    userRoles: [{ role: { name: 'admin' } }],
    claims: { token: 'token-2', provider: 'mock' },
  },
};

@Injectable()
export class MockAuthProvider implements AuthProviderInterface {
  async validateToken(token: string): Promise<AuthorizedUser> {
    return (
      MOCK_USERS[token] ?? {
        id: 'default-user',
        sub: 'default-user',
        email: 'default@example.com',
        userRoles: [{ role: { name: 'user' } }],
        claims: { token, provider: 'mock' },
      }
    );
  }
}
