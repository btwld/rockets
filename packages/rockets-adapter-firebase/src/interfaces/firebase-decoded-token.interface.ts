/**
 * Minimal shape of a Firebase ID token payload after verification.
 * Mirrors the subset of `firebase-admin.auth.DecodedIdToken` Rockets
 * needs, without coupling this package to a specific firebase-admin
 * major version.
 */
export interface FirebaseDecodedTokenInterface {
  /** Firebase user id — always present on a verified token. */
  readonly uid: string;
  /** Subject claim — equal to `uid`. */
  readonly sub: string;
  readonly email?: string;
  readonly email_verified?: boolean;
  readonly name?: string;
  /** Custom claims set via `admin.auth().setCustomUserClaims()`. */
  readonly [claim: string]: unknown;
}
