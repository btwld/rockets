import { DynamicModule, Type } from '@nestjs/common';
import type {
  AbstractUpsertUserMetadataHandler,
  AbstractGetUserMetadataHandler,
  RocketsRepositoriesConfig,
  ResourceDefinitionInput,
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
   * The same `resources` option accepted by `RocketsCoreModule`.
   *
   * - `defineResource()` = generated wiring (includes entity + relation checks)
   * - hand-built `RocketsResourceConfig` = you register the entity in `repositories`
   */
  resources?: ReadonlyArray<ResourceDefinitionInput>;
}
