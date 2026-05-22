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
    return { verifier: SampleFakeFirebaseVerifier };
  }

  return { firebaseApp: createFirebaseAdminApp() };
}
