/**
 * E2E / local demo verifier — not for production.
 * Accepts documented bearer tokens (see sample-code-review e2e tests).
 */
import { Injectable } from '@nestjs/common';

import type {
  FirebaseDecodedTokenInterface,
  FirebaseTokenVerifierInterface,
  FirebaseVerifyOptions,
} from '@bitwild/rockets-adapter-firebase';

const FIXTURES: Record<string, FirebaseDecodedTokenInterface> = {
  'fb-admin-token': {
    uid: 'firebase-admin',
    sub: 'firebase-admin',
    email: 'admin@firebase.demo',
    email_verified: true,
    name: 'Firebase Admin',
    roles: ['admin'],
  },
  'fb-user-token': {
    uid: 'firebase-user',
    sub: 'firebase-user',
    email: 'user@firebase.demo',
    email_verified: true,
    name: 'Firebase User',
    roles: ['user'],
  },
};

@Injectable()
export class SampleFakeFirebaseVerifier
  implements FirebaseTokenVerifierInterface
{
  async verifyIdToken(
    token: string,
    _options?: FirebaseVerifyOptions,
  ): Promise<FirebaseDecodedTokenInterface> {
    if (token === 'fb-revoked-token') {
      throw Object.assign(new Error('Firebase ID token has been revoked'), {
        code: 'auth/id-token-revoked',
      });
    }

    const decoded = FIXTURES[token];
    if (!decoded) {
      throw Object.assign(new Error('Firebase ID token is invalid'), {
        code: 'auth/argument-error',
      });
    }

    return decoded;
  }
}
