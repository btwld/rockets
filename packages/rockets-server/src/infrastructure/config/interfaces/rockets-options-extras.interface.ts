import { DynamicModule, Type } from '@nestjs/common';
import type {
  AbstractUpsertUserMetadataHandler,
  AbstractGetUserMetadataHandler,
  AuthBootstrap,
  RepositoryBootstrap,
  RepositoryModuleInterface,
  ResourceInput,
  RocketsUserMetadataConfig,
} from '@bitwild/rockets-core';

export interface DisableControllerOptionsInterface {
  me?: boolean;
}

export type RocketsAuthOption = AuthBootstrap | ReadonlyArray<AuthBootstrap>;

/** @deprecated Prefer {@link RocketsAuthOption}. */
export type RocketsAuthInput = RocketsAuthOption;

export interface RocketsOptionsExtrasInterface
  extends Pick<DynamicModule, 'global' | 'controllers'> {
  enableGlobalGuard?: boolean;
  disableController?: DisableControllerOptionsInterface;

  /**
   * Authentication wiring. Accepts a single entry or an array (chain):
   *  - `AuthBootstrap` — from `defineFirebaseAuth()`, `defineSampleAuth()`, etc.
   */
  auth?: RocketsAuthOption;

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
