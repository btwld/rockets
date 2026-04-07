import { Injectable } from '@nestjs/common';
import { AuthProviderInterface } from '../../domain/interfaces/auth-provider.interface';
import { AuthorizedUser } from '../../domain/interfaces/auth-user.interface';

@Injectable()
export class FirebaseAuthProviderFixture implements AuthProviderInterface {
  async validateToken(_token: string): Promise<AuthorizedUser> {
    // Simple test implementation - always returns the same user
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
  }
}
