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
