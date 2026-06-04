import type { AuthBootstrap } from '@bitwild/rockets-core';

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
 * Auth-owned entities belong in app `resources[]`, not here.
 */
export type DefineFirebaseAuthInput =
  | Readonly<{
      forRoot: FirebaseAuthModuleOptions;
      forRootAsync?: never;
    }>
  | Readonly<{
      forRootAsync: FirebaseAuthModuleAsyncOptions;
      forRoot?: never;
    }>;

/**
 * Build an {@link AuthBootstrap} that wires `FirebaseAuthModule` into core.
 */
export function defineFirebaseAuth(
  input: DefineFirebaseAuthInput,
): AuthBootstrap {
  return {
    adapter: FirebaseAuthAdapter,
    forRoot: () =>
      input.forRootAsync !== undefined
        ? FirebaseAuthModule.forRootAsync(input.forRootAsync)
        : FirebaseAuthModule.forRoot(input.forRoot),
  };
}
