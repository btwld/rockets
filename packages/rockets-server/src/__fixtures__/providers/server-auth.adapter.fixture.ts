import { Injectable, UnauthorizedException } from '@nestjs/common';
import type {
  AuthAdapterInterface,
  AuthAttemptResult,
  AuthRequest,
} from '@bitwild/rockets-core';
import { extractBearerToken } from '@bitwild/rockets-core';

@Injectable()
export class ServerAuthAdapterFixture implements AuthAdapterInterface {
  async authenticate(request: AuthRequest): Promise<AuthAttemptResult> {
    const token = extractBearerToken(request);
    if (token === null) return { matched: false };

    if (token === 'valid-token') {
      return {
        matched: true,
        user: {
          id: 'serverauth-user-1',
          sub: 'serverauth-user-1',
          email: 'serverauth@example.com',
          userRoles: [{ role: { name: 'admin' } }],
          claims: {
            sub: 'serverauth-user-1',
            email: 'serverauth@example.com',
            roles: ['admin'],
          },
        },
      };
    }
    if (token === 'firebase-token') {
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
    return {
      matched: true,
      error: new UnauthorizedException('Authentication failed'),
    };
  }
}
