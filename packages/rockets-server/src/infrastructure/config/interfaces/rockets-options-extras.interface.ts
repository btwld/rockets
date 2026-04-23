import { DynamicModule, Type } from '@nestjs/common';
import type {
  AbstractUpsertUserMetadataHandler,
  AbstractGetUserMetadataHandler,
  RocketsRepositoriesConfig,
  RocketsResourceInput,
} from '@bitwild/rockets-core';

export interface DisableControllerOptionsInterface {
  me?: boolean;
}

export interface RocketsOptionsExtrasInterface
  extends Pick<DynamicModule, 'global' | 'controllers'> {
  enableGlobalGuard?: boolean;
  disableController?: DisableControllerOptionsInterface;

  /**
   * Unified repository config. Passed directly to RocketsCoreModule.
   *
   * Includes `userMetadata` (required by core handlers) and an optional
   * `entities` array for additional standalone entities.
   *
   * Omit when rockets-auth handles repository registration.
   */
  repositories?: RocketsRepositoriesConfig;

  /**
   * Optional custom handler overrides for user metadata operations.
   * Each must extend the corresponding abstract base class.
   */
  handlers?: {
    upsertUserMetadata?: Type<AbstractUpsertUserMetadataHandler>;
    getUserMetadata?: Type<AbstractGetUserMetadataHandler>;
  };

  /**
   * Declarative CRUD resources. Accepts either:
   * - `RocketsResourceBundle` values returned by `defineResource()`
   *   (bundles auto-contribute their entity to repository persistence), or
   * - Raw `RocketsResourceConfig` objects for hand-wired resources (the
   *   consumer must register the entity via `repositories.entities`).
   */
  resources?: ReadonlyArray<RocketsResourceInput>;
}
