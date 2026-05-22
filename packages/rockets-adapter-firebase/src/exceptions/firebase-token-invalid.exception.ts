import { FirebaseAuthException } from './firebase-auth.exception';

export class FirebaseTokenInvalidException extends FirebaseAuthException {
  constructor(cause?: unknown) {
    super('Firebase ID token is invalid or expired', cause);
  }
}

export class FirebaseTokenRevokedException extends FirebaseAuthException {
  constructor(cause?: unknown) {
    super('Firebase ID token has been revoked', cause);
  }
}

export class FirebaseTokenMissingSubjectException extends FirebaseAuthException {
  constructor() {
    super('Firebase ID token is missing the `sub`/`uid` claim');
  }
}
