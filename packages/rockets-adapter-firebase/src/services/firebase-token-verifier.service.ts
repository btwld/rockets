import { Injectable } from '@nestjs/common';

import { FirebaseDecodedTokenInterface } from '../interfaces/firebase-decoded-token.interface';
import {
  FirebaseTokenVerifierInterface,
  FirebaseVerifyOptions,
} from '../interfaces/firebase-token-verifier.interface';
import { resolveFirebaseAdminAuth } from '../utils/resolve-firebase-admin-auth.util';

/**
 * Default verifier — wraps a `firebase-admin` app's auth instance.
 * Tests and advanced consumers replace it via the
 * `FIREBASE_TOKEN_VERIFIER_TOKEN` provider.
 */
@Injectable()
export class FirebaseTokenVerifierService
  implements FirebaseTokenVerifierInterface
{
  constructor(private readonly firebaseApp: unknown) {}

  async verifyIdToken(
    token: string,
    options?: FirebaseVerifyOptions,
  ): Promise<FirebaseDecodedTokenInterface> {
    const decoded = await resolveFirebaseAdminAuth(
      this.firebaseApp,
    ).verifyIdToken(token, options?.checkRevoked ?? false);

    return {
      ...decoded,
      uid: decoded.uid,
      sub: decoded.uid,
    };
  }
}
