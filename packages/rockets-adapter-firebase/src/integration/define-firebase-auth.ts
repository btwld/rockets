import {
  ROCKETS_AUTH_INTEGRATION_KIND,
  type ResourceInput,
  type RocketsAuthIntegration,
} from '@bitwild/rockets-core';

import { FirebaseAuthAdapter } from '../adapters/firebase-auth.adapter';
import type { FirebaseAuthModuleAsyncOptions } from '../interfaces/firebase-auth-async-options.interface';
import type { FirebaseAuthModuleOptions } from '../interfaces/firebase-auth-options.interface';
import { FirebaseAuthModule } from '../modules/firebase-auth.module';

/**
 * Input for {@link defineFirebaseAuth}.
 *
 * Choose exactly one wiring shape:
 *  - `forRoot` — sync options (`FirebaseAuthModule.forRoot` payload).
 *  - `forRootAsync` — async options (`FirebaseAuthModule.forRootAsync` payload).
 *
 * `resources` is forwarded to `RocketsModule`'s planner. Apps that hold a
 * local mirror of `UserEntity` (so app features can inject a
 * `RepositoryInterface<UserEntity>` even when auth lives in Firebase) pass
 * it here, e.g.:
 *
 * ```ts
 * defineFirebaseAuth({
 *   forRoot: { firebaseApp: admin.initializeApp({ ... }) },
 *   resources: [defineModuleResource({ entities: [UserEntity] })],
 * });
 * ```
 */
export type DefineFirebaseAuthInput =
  | (Readonly<{
      forRoot: FirebaseAuthModuleOptions;
      forRootAsync?: never;
      resources?: readonly ResourceInput[];
    }>)
  | (Readonly<{
      forRootAsync: FirebaseAuthModuleAsyncOptions;
      forRoot?: never;
      resources?: readonly ResourceInput[];
    }>);

/**
 * Build a `RocketsAuthIntegration` that wires `FirebaseAuthModule` into
 * `RocketsModule.forRoot({ auth: ... })`.
 *
 * Why this exists: every Firebase-backed app reproduces the same five
 * lines — import `FirebaseAuthModule.forRoot(...)`, expose
 * `FirebaseAuthAdapter`, mark it as `ROCKETS_AUTH_INTEGRATION_KIND`,
 * forward any extra `resources`. Doing it once here keeps the public
 * surface honest (one helper per adapter) and prevents the subtle bug
 * where forgetting `kind:` causes `RocketsModule` to treat the adapter
 * as standalone and double-provide it.
 */
export function defineFirebaseAuth(
  input: DefineFirebaseAuthInput,
): RocketsAuthIntegration {
  const moduleImport = input.forRootAsync
    ? FirebaseAuthModule.forRootAsync(input.forRootAsync)
    : FirebaseAuthModule.forRoot(input.forRoot);

  return {
    kind: ROCKETS_AUTH_INTEGRATION_KIND,
    nestImports: [moduleImport],
    authAdapter: FirebaseAuthAdapter,
    resources: input.resources ?? [],
  };
}
