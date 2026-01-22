import { Injectable } from '@nestjs/common';
import { AuthProviderInterface, AuthorizedUser } from '@bitwild/rockets';

@Injectable()
export class MockAuthProvider implements AuthProviderInterface {
  async validateToken(token: string): Promise<AuthorizedUser> {
    // Mock implementation - returns different data based on token
    if (token === 'token-1') {
      return {
        id: 'user-123',
        sub: 'user-123', 
        email: 'user1@example.com',
        userRoles: [{ role: { name: 'user' }}],
        claims: {
          token,
          provider: 'mock'
        }
      };
    } else if (token === 'token-2') {
      return {
        id: 'user-456',
        sub: 'user-456',
        email: 'user2@example.com', 
        userRoles: [{ role: { name: 'admin' }}],
        claims: {
          token,
          provider: 'mock'
        }
      };
    }

    // Default response for other tokens
    return {
      id: 'default-user',
      sub: 'default-user',
      email: 'default@example.com',
      userRoles: [{ role: { name: 'user' }}],
      claims: {
        token,
        provider: 'mock'
      }
    };
  }
}
