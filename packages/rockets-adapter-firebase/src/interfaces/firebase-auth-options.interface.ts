import { ModuleMetadata, Type } from '@nestjs/common';

import { FirebaseTokenVerifierInterface } from './firebase-token-verifier.interface';
import { FirebaseUserResolverInterface } from './firebase-user-resolver.interface';

/**
 * Options accepted by `FirebaseAuthModule.forRoot()` /
 * `forRootAsync()`.
 *
 * Two ways to supply the verifier:
 * 1. **`firebaseApp`** — an initialized `admin.app.App` instance from
 *    `firebase-admin`. The module wraps it with the default
 *    `FirebaseTokenVerifierService`. This is the common case.
 * 2. **`verifier`** — your own class implementing
 *    `FirebaseTokenVerifierInterface`. Use this when you already manage
 *    firebase-admin lifecycle elsewhere or want to swap the SDK for
 *    custom logic (e.g. token cache, multi-project router).
 */
export interface FirebaseAuthModuleOptions
  extends Pick<ModuleMetadata, 'imports'> {
  /**
   * An initialized firebase-admin app. Required when `verifier` is not
   * provided. Typed loosely (`unknown`) so this package does NOT pull
   * `firebase-admin` types at compile time — it's an optional peer dep.
   */
  readonly firebaseApp?: unknown;
  /**
   * Custom verifier implementation. Takes precedence over
   * `firebaseApp` when both are supplied.
   */
  readonly verifier?: Type<FirebaseTokenVerifierInterface>;
  /**
   * Custom user resolver. When omitted, the default resolver returns
   * the claims directly from the Firebase token (uid, email, name,
   * roles if present in custom claims).
   */
  readonly userResolver?: Type<FirebaseUserResolverInterface>;
  /**
   * When true (default false), the verifier asks Firebase whether the
   * token has been revoked on every request. Adds a network round-trip
   * — only enable for high-security flows.
   */
  readonly checkRevoked?: boolean;
}
