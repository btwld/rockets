import { Injectable } from '@nestjs/common';
import type {
  AuthAdapterInterface,
  AuthAttemptResult,
  AuthRequest,
} from '@bitwild/rockets-core';
import { extractBearerToken } from '@bitwild/rockets-core';

@Injectable()
export class FirebaseAuthAdapterFixture implements AuthAdapterInterface {
  async authenticate(request: AuthRequest): Promise<AuthAttemptResult> {
    const token = extractBearerToken(request);
    if (token === null) return { matched: false };

    return {
      matched: true,
      user: {
        id: 'firebase-user-1',
        sub: 'firebase-user-1',
        email: 'firebase@example.com',
        userRoles: [{ role: { name: 'user' } }],
        claims: {
          sub: 'firebase-user-1',
          email: 'firebase@example.com',
          roles: ['user'],
        },
      },
    };
  }
}
