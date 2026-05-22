import { FirebaseDecodedTokenInterface } from './firebase-decoded-token.interface';

/**
 * Abstraction over `admin.auth().verifyIdToken()`. The real
 * implementation is `FirebaseTokenVerifierService` which wraps the
 * firebase-admin SDK; tests inject mocks via
 * `FIREBASE_TOKEN_VERIFIER_TOKEN`.
 */
export interface FirebaseTokenVerifierInterface {
  /**
   * Verify a Firebase ID token. Implementations MUST throw when:
   * - the token signature is invalid;
   * - the token is expired;
   * - the token is for a project the verifier was not initialized with;
   * - `checkRevoked` is enabled and the user was disabled/revoked.
   */
  verifyIdToken(
    token: string,
    options?: FirebaseVerifyOptions,
  ): Promise<FirebaseDecodedTokenInterface>;
}

export interface FirebaseVerifyOptions {
  /** When true, the verifier checks the token has not been revoked. */
  readonly checkRevoked?: boolean;
}
