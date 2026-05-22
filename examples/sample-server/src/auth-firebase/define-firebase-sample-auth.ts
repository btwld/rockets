/**
 * ⚠️ SAMPLE / DEMO CODE — NOT FOR PRODUCTION ⚠️
 *
 * Builds the `RocketsAuthIntegration` bundle for `AUTH_PROVIDER=firebase`
 * mode. The shape (`kind`, `nestImports`, `authAdapter`, `resources`)
 * is what `RocketsModule.forRoot({ auth: ... })` accepts as the third
 * `auth:` flavor (after `Type<AuthAdapterInterface>` and
 * `AuthFeatureBundle`).
 *
 * Why this path and not `defineAuthFeature()`?
 *  - The Firebase adapter is provided by `FirebaseAuthModule.forRoot()`
 *    along with its dependencies (verifier, user resolver, options).
 *    Re-providing `FirebaseAuthAdapter` locally would create a second
 *    instance that can't resolve those tokens.
 *  - `RocketsAuthIntegration` accepts arbitrary `nestImports`, so we
 *    pull `FirebaseAuthModule` in as-is. The adapter class is only
 *    referenced via `authAdapter:` (used to alias `AUTH_ADAPTER_TOKEN`).
 */
import {
  FirebaseAuthAdapter,
  FirebaseAuthModule,
} from '@bitwild/rockets-adapter-firebase';
import {
  defineModuleResource,
  ROCKETS_AUTH_INTEGRATION_KIND,
} from '@bitwild/rockets-core';
import type { RocketsAuthIntegration } from '@bitwild/rockets-core';

import { UserEntity } from '../auth/user.entity';

import { SampleFakeFirebaseVerifier } from './sample-fake-firebase-verifier';

export function defineFirebaseSampleAuth(): RocketsAuthIntegration {
  return {
    kind: ROCKETS_AUTH_INTEGRATION_KIND,
    // The sample wires the fake verifier; a real app would pass
    // `firebaseApp: admin.initializeApp({...})` instead.
    nestImports: [
      FirebaseAuthModule.forRoot({
        verifier: SampleFakeFirebaseVerifier,
      }),
    ],
    authAdapter: FirebaseAuthAdapter,
    // `FirebaseAuthModule.forRoot()` already provides `FirebaseAuthAdapter`
    // (and is `global: true`). Core MUST NOT auto-push the class into
    // its own scope — it would create a second instance there where
    // `FIREBASE_TOKEN_VERIFIER_TOKEN` isn't reachable, blowing up
    // `Nest can't resolve dependencies` at boot.
    authProviderExternallyManaged: true,
    // Register `UserEntity` even in Firebase mode so app-level
    // features (pet-transfer, audit, event listeners) that hold a
    // dynamic-repo handle still resolve. We do NOT register the
    // JWT-flavored `AuthController` — signup/login happens
    // client-side via the Firebase SDK in this mode.
    resources: [defineModuleResource({ entities: [UserEntity] })],
  };
}
