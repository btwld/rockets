// Public surface — keep deliberately small. Anything imported via
// `dist/index.js` is considered a stable API.

// Module + adapter
export { FirebaseAuthModule } from './modules/firebase-auth.module';
export { FirebaseAuthAdapter } from './adapters/firebase-auth.adapter';

// Tokens — exposed so consumers can override providers in their own
// modules without re-implementing `FirebaseAuthModule.forRoot()`.
export {
  FIREBASE_AUTH_MODULE_OPTIONS_TOKEN,
  FIREBASE_TOKEN_VERIFIER_TOKEN,
  FIREBASE_USER_RESOLVER_TOKEN,
} from './constants/firebase-auth.constants';

// Interfaces (no concrete dependency on firebase-admin types)
export type {
  FirebaseAuthModuleAsyncOptions,
  FirebaseAuthModuleOptionsFactory,
} from './interfaces/firebase-auth-async-options.interface';
export { FirebaseAuthModuleOptions } from './interfaces/firebase-auth-options.interface';
export { FirebaseDecodedTokenInterface } from './interfaces/firebase-decoded-token.interface';
export {
  FirebaseTokenVerifierInterface,
  FirebaseVerifyOptions,
} from './interfaces/firebase-token-verifier.interface';
export { FirebaseUserResolverInterface } from './interfaces/firebase-user-resolver.interface';

// Services (re-exported so a consumer can register their own variant
// of the default resolver while still composing with this package).
export { DefaultFirebaseUserResolverService } from './services/default-firebase-user-resolver.service';
export { FirebaseTokenVerifierService } from './services/firebase-token-verifier.service';

// Exceptions
export { FirebaseAuthException } from './exceptions/firebase-auth.exception';
export {
  FirebaseTokenInvalidException,
  FirebaseTokenMissingSubjectException,
  FirebaseTokenRevokedException,
} from './exceptions/firebase-token-invalid.exception';
