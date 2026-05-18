import { DynamicModule, Type } from '@nestjs/common';
import type { RepositoryModuleInterface } from '@bitwild/rockets-repository';
import type {
  AbstractUpsertUserMetadataHandler,
  AbstractGetUserMetadataHandler,
  AuthAdapterInterface,
  AuthFeatureBundle,
  RepositoryBootstrap,
  ResourceInput,
  RocketsUserMetadataConfig,
  RocketsAuthIntegration,
} from '@bitwild/rockets-core';

export interface DisableControllerOptionsInterface {
  me?: boolean;
}

export interface RocketsOptionsExtrasInterface
  extends Pick<DynamicModule, 'global' | 'controllers'> {
  enableGlobalGuard?: boolean;
  disableController?: DisableControllerOptionsInterface;

  /**
   * - `Type<AuthAdapterInterface>` — bare adapter; caller registers providers.
   * - `AuthFeatureBundle` — from `defineAuthFeature()`; resource prepended to `resources[]`.
   * - `RocketsAuthIntegration` — from `defineRocketsAuth()` in `@bitwild/rockets-auth`;
   *   `nestImports` append after core; `resources` merged into the planner.
   */
  auth?:
    | Type<AuthAdapterInterface>
    | AuthFeatureBundle
    | RocketsAuthIntegration;

  /**
   * User-metadata config — entity + DTOs (+ optional response DTO / adapter).
   */
  userMetadata?: RocketsUserMetadataConfig;

  /**
   * Default persistence adapter (e.g. `TypeOrmRepositoryModule`).
   *
   * Forwarded to `RocketsCoreModule` as the root adapter for every
   * `defineResource()` / `defineModuleResource()` registration.
   *
   * Accepts a plain `RepositoryModuleInterface` (just `forFeature`) or a
   * `RepositoryBootstrap` (also implements `forRoot(entities)`) — when a
   * bootstrap-aware adapter is passed, core derives the entity list from
   * `resources[]` + `userMetadata` and forwards it to `forRoot`, so the
   * caller never lists entities twice.
   *
   * Omit when an upstream module (e.g. `rockets-server-auth`) already
   * registers all entities the app needs.
   */
  repository?: RepositoryModuleInterface | RepositoryBootstrap;

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
   * Mix `defineResource()` (CRUD), `defineModuleResource()` (non-CRUD
   * persistence / Nest wiring), and hand-built `RocketsResourceConfig`.
   */
  resources?: ReadonlyArray<ResourceInput>;
}
