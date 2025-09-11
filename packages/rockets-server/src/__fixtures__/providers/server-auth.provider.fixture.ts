import { Injectable } from '@nestjs/common';
import { AuthProviderInterface } from '../../interfaces/auth-provider.interface';
import { AuthorizedUser } from '../../interfaces/auth-user.interface';

@Injectable()
export class ServerAuthProviderFixture implements AuthProviderInterface {
  async validateToken(token: string): Promise<AuthorizedUser> {
    // Simple test implementation - always returns the same user
    return {
      id: 'serverauth-user-1',
      sub: 'serverauth-user-1',
      email: 'serverauth@example.com',
      roles: ['admin'],
      claims: { sub: 'serverauth-user-1', email: 'serverauth@example.com', roles: ['admin'] },
    };
  }
}