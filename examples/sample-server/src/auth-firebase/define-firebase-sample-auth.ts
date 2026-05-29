/**
 * Thin wrapper around `defineFirebaseAuth()` from the adapter package.
 *
 * The sample keeps a wrapper here only so the env switch in
 * `app.module.ts` stays a one-liner:
 *
 *   const auth = isFirebase
 *     ? defineFirebaseSampleAuth()
 *     : defineSampleAuth();
 *
 * The substantive Firebase wiring (provider chain, `FirebaseAuthModule`
 * import, adapter registration, ROCKETS_AUTH_INTEGRATION_KIND) lives
 * inside `defineFirebaseAuth()` — see
 * `packages/rockets-adapter-firebase/src/integration/define-firebase-auth.ts`.
 *
 * Two sample-specific details remain here:
 *  - `verifier: SampleFakeFirebaseVerifier` — replaces firebase-admin so
 *    the e2e suite runs without network/credentials. A real app passes
 *    `forRoot: { firebaseApp: admin.initializeApp({ ... }) }` instead.
 *  - `resources: [defineModuleResource({ entities: [UserEntity] })]`
 *    keeps a local `UserEntity` mirror so app features (pet-transfer,
 *    audit, event listeners) can inject a
 *    `RepositoryInterface<UserEntity>` even in Firebase-auth mode.
 *    No JWT-flavored `AuthController` is registered here — signup/login
 *    happens client-side via the Firebase SDK.
 */
import { defineFirebaseAuth } from '@bitwild/rockets-adapter-firebase';
import {
  defineModuleResource,
  type RocketsAuthIntegration,
} from '@bitwild/rockets-core';

import { UserEntity } from '../auth/user.entity';

import { SampleFakeFirebaseVerifier } from './sample-fake-firebase-verifier';

export function defineFirebaseSampleAuth(): RocketsAuthIntegration {
  return defineFirebaseAuth({
    forRoot: { verifier: SampleFakeFirebaseVerifier },
    resources: [defineModuleResource({ entities: [UserEntity] })],
  });
}
