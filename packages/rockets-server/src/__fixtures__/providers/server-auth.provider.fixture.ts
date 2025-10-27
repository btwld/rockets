import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthProviderInterface } from '../../interfaces/auth-provider.interface';
import { AuthorizedUser } from '../../interfaces/auth-user.interface';

@Injectable()
export class ServerAuthProviderFixture implements AuthProviderInterface {
  async validateToken(token: string): Promise<AuthorizedUser> {
    // Simple test implementation - validate token and return user or throw error
    if (token === 'valid-token') {
      return {
        id: 'serverauth-user-1',
        sub: 'serverauth-user-1',
        email: 'serverauth@example.com',
        userRoles: [{ role: { name: 'admin' } }],
        claims: {
          sub: 'serverauth-user-1',
          email: 'serverauth@example.com',
          roles: ['admin'],
        },
      };
    } else if (token === 'firebase-token') {
      return {
        id: 'firebase-user-1',
        sub: 'firebase-user-1',
        email: 'firebase@example.com',
        userRoles: [{ role: { name: 'user' } }],
        claims: {
          sub: 'firebase-user-1',
          email: 'firebase@example.com',
          roles: ['user'],
        },
      };
    } else {
      throw new UnauthorizedException('Invalid authentication token');
    }
  }
}
