import { Inject, Injectable, Logger } from '@nestjs/common';

import type {
  AuthAdapterInterface,
  AuthAttemptResult,
  AuthRequest,
  AuthorizedUser,
} from '@bitwild/rockets-core';
import { extractBearerToken } from '@bitwild/rockets-core';

import {
  FIREBASE_AUTH_MODULE_OPTIONS_TOKEN,
  FIREBASE_TOKEN_VERIFIER_TOKEN,
  FIREBASE_USER_RESOLVER_TOKEN,
} from '../constants/firebase-auth.constants';
import { FirebaseAuthException } from '../exceptions/firebase-auth.exception';
import {
  FirebaseTokenInvalidException,
  FirebaseTokenMissingSubjectException,
  FirebaseTokenRevokedException,
} from '../exceptions/firebase-token-invalid.exception';
import { FirebaseAuthModuleOptions } from '../interfaces/firebase-auth-options.interface';
import { FirebaseTokenVerifierInterface } from '../interfaces/firebase-token-verifier.interface';
import { FirebaseUserResolverInterface } from '../interfaces/firebase-user-resolver.interface';

/**
 * `AuthAdapterInterface` implementation backed by Firebase
 * Authentication. Wire it as the `authProvider` in
 * `RocketsCoreModule.forRoot()` (or as a factory that returns it from
 * `forRootAsync()`).
 *
 * Failure mapping (every case below has a regression test in
 * `__tests__/firebase-auth.adapter.spec.ts`):
 *
 * | Cause                          | Exception                              |
 * |--------------------------------|----------------------------------------|
 * | Empty / null token             | FirebaseTokenInvalidException          |
 * | Verifier throws auth/* error   | FirebaseTokenInvalidException          |
 * | `auth/id-token-revoked` error  | FirebaseTokenRevokedException          |
 * | Token decoded but missing uid  | FirebaseTokenMissingSubjectException   |
 * | User resolver throws           | FirebaseAuthException (wraps original) |
 */
@Injectable()
export class FirebaseAuthAdapter implements AuthAdapterInterface {
  private readonly logger = new Logger(FirebaseAuthAdapter.name);

  constructor(
    @Inject(FIREBASE_TOKEN_VERIFIER_TOKEN)
    private readonly verifier: FirebaseTokenVerifierInterface,
    @Inject(FIREBASE_USER_RESOLVER_TOKEN)
    private readonly userResolver: FirebaseUserResolverInterface,
    @Inject(FIREBASE_AUTH_MODULE_OPTIONS_TOKEN)
    private readonly options: FirebaseAuthModuleOptions,
  ) {}

  async authenticate(request: AuthRequest): Promise<AuthAttemptResult> {
    const token = extractBearerToken(request);
    if (token === null) return { matched: false };

    try {
      const user = await this.validateToken(token);
      return { matched: true, user };
    } catch (error) {
      if (
        error instanceof FirebaseTokenInvalidException ||
        error instanceof FirebaseTokenRevokedException ||
        error instanceof FirebaseTokenMissingSubjectException ||
        error instanceof FirebaseAuthException
      ) {
        return { matched: true, error };
      }
      return { matched: true, error: new FirebaseTokenInvalidException() };
    }
  }

  private async validateToken(token: string): Promise<AuthorizedUser> {
    if (typeof token !== 'string' || token.length === 0) {
      throw new FirebaseTokenInvalidException();
    }

    const decoded = await this.verifyOrThrow(token);

    if (typeof decoded.uid !== 'string' || decoded.uid.length === 0) {
      throw new FirebaseTokenMissingSubjectException();
    }

    try {
      return await this.userResolver.resolve(decoded);
    } catch (error) {
      this.logger.error(
        `Firebase user resolver failed for uid ${decoded.uid}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      if (error instanceof FirebaseAuthException) {
        throw error;
      }
      throw new FirebaseAuthException('Firebase user resolution failed', error);
    }
  }

  private async verifyOrThrow(token: string) {
    try {
      return await this.verifier.verifyIdToken(token, {
        checkRevoked: this.options.checkRevoked ?? false,
      });
    } catch (error) {
      const code = readFirebaseErrorCode(error);
      if (code === 'auth/id-token-revoked') {
        this.logger.warn('Firebase token rejected: revoked');
        throw new FirebaseTokenRevokedException(error);
      }
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Firebase token verification failed${
          code ? ` (${code})` : ''
        }: ${detail}`,
      );
      throw new FirebaseTokenInvalidException(error);
    }
  }
}

function readFirebaseErrorCode(error: unknown): string | undefined {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string'
  ) {
    return (error as { code: string }).code;
  }
  return undefined;
}
