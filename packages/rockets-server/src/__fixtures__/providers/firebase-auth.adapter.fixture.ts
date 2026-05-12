import { Injectable } from '@nestjs/common';
import { AuthAdapterInterface } from '../../domain/interfaces/auth-adapter.interface';
import { AuthorizedUser } from '../../domain/interfaces/auth-user.interface';

@Injectable()
export class FirebaseAuthAdapterFixture implements AuthAdapterInterface {
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
