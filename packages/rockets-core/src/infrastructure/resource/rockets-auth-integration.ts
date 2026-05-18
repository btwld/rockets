import type { DynamicModule, Type } from '@nestjs/common';
import type { AuthAdapterInterface } from '../../domain/interfaces/auth-adapter.interface';
import type { RocketsUserMetadataConfig } from '../../domain/interfaces/rockets-user-metadata-config.interface';
import type { ResourceInput } from './aggregate-resources';

/**
 * Discriminant for {@link RocketsAuthIntegration}. Stable for tooling and AI
 * codegen — do not reuse this string for other bundle kinds.
 */
export const ROCKETS_AUTH_INTEGRATION_KIND =
  'rockets-auth-integration' as const;

/**
 * Bundle returned by `defineRocketsAuth()` from `@bitwild/rockets-auth`.
 *
 * Pass as `RocketsModule.forRoot({ auth: integration, ... })`: the server
 * merges `resources` into the core planner, forwards `authAdapter` to
 * `RocketsCoreModule`, appends `nestImports` **after** core so repository
 * rows exist before `RocketsAuthModule` boots.
 */
export interface RocketsAuthIntegration {
  readonly kind: typeof ROCKETS_AUTH_INTEGRATION_KIND;
  readonly nestImports: readonly DynamicModule[];
  readonly authAdapter: Type<AuthAdapterInterface>;
  readonly resources: readonly ResourceInput[];
  /**
   * When set, `RocketsModule` uses this for `extras.userMetadata` if the
   * caller did not pass `userMetadata` explicitly (single source from
   * `defineRocketsAuth`).
   */
  readonly userMetadata?: RocketsUserMetadataConfig;
  readonly rocketsDefaults?: Readonly<{
    readonly enableGlobalGuard?: boolean;
  }>;
  /**
   * Opt-in: signal that `authAdapter` is already provided by a module
   * in `nestImports` (and that module is `global: true`, so the
   * adapter is reachable from core's scope via `useExisting`).
   *
   * When **false / omitted (default, back-compat):** core auto-pushes
   * the adapter class as a provider in its own scope alongside the
   * `AUTH_ADAPTER_TOKEN` alias. This is what `defineRocketsAuth` from
   * `@bitwild/rockets-auth` has always relied on — even though
   * `RocketsAuthModule` also provides the same class, the duplicate
   * is benign because `RocketsJwtAuthAdapter`'s constructor only
   * depends on globally-available providers (`QueryBus`).
   *
   * When **true:** core skips the auto-push and ONLY registers the
   * `AUTH_ADAPTER_TOKEN` alias. Required for adapters whose
   * constructor pulls dependencies from a private module scope
   * (`FirebaseAuthAdapter` needs `FIREBASE_TOKEN_VERIFIER_TOKEN`,
   * which lives inside `FirebaseAuthModule` — re-instantiating in
   * core's scope fails `Nest can't resolve dependencies` at boot).
   */
  readonly authProviderExternallyManaged?: boolean;
}

export function isRocketsAuthIntegration(
  value: unknown,
): value is RocketsAuthIntegration {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { kind?: unknown }).kind === ROCKETS_AUTH_INTEGRATION_KIND
  );
}
