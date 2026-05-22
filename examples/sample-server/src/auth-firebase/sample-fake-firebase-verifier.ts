/**
 * ⚠️ SAMPLE / DEMO CODE — NOT FOR PRODUCTION ⚠️
 *
 * Stand-in for `firebase-admin`'s `auth().verifyIdToken()`. Lets the
 * sample server boot in `AUTH_PROVIDER=firebase` mode WITHOUT a real
 * Firebase project, service account, or network access — so the e2e
 * test and a curl-style demo work out of the box.
 *
 * The "tokens" this verifier accepts are deliberately bogus and
 * documented in the sample README:
 *
 * | Bearer token            | Resolves to                                          |
 * |-------------------------|------------------------------------------------------|
 * | `fb-admin-token`        | uid=`firebase-admin`, email=`admin@firebase.demo`    |
 * | `fb-user-token`         | uid=`firebase-user`, email=`user@firebase.demo`      |
 * | `fb-revoked-token`      | throws `auth/id-token-revoked` (forces 401 path)     |
 * | anything else           | throws `auth/argument-error` (forces 401 path)       |
 *
 * Swap with `FirebaseTokenVerifierService` (wraps the real SDK) for
 * production. See `packages/rockets-adapter-firebase/README.md`.
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
