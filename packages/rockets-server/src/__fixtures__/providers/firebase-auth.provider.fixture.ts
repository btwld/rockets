import { Injectable } from '@nestjs/common';
import { AuthProviderInterface } from '../../interfaces/auth-provider.interface';
import { AuthorizedUser } from '../../interfaces/auth-user.interface';

@Injectable()
export class FirebaseAuthProviderFixture implements AuthProviderInterface {
  async validateToken(token: string): Promise<AuthorizedUser> {
    // Simple test implementation - always returns the same user
    return {
      id: 'firebase-user-1',
      sub: 'firebase-user-1',
      email: 'firebase@example.com',
      roles: ['user'],
      claims: { sub: 'firebase-user-1', email: 'firebase@example.com', roles: ['user'] },
    };
  }
}