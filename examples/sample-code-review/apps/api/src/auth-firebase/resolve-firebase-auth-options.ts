import type { FirebaseAuthModuleOptions } from '@bitwild/rockets-adapter-firebase';

import { createFirebaseAdminApp } from './create-firebase-admin-app';
import { SampleFakeFirebaseVerifier } from './sample-fake-firebase-verifier';

/**
 * Resolves options for `FirebaseAuthModule.forRootAsync()`:
 * - e2e: custom verifier (no Admin SDK)
 * - runtime: modular `firebase-admin/app` singleton
 */
export function resolveFirebaseAuthModuleOptions(): FirebaseAuthModuleOptions {
  if (process.env.FIREBASE_USE_FAKE === 'true') {
    // The fake verifier avoids live Firebase Auth calls, but the app still
    // needs a Firebase Admin singleton so the Firestore repository backend can
    // bootstrap during `RocketsModule.forRoot()`.
    createFirebaseAdminApp();
    return { verifier: SampleFakeFirebaseVerifier };
  }

  return { firebaseApp: createFirebaseAdminApp() };
}
