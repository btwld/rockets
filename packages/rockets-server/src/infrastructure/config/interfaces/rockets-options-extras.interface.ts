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

/**
 * One entry accepted by `RocketsOptionsExtrasInterface.auth`. The
 * `auth` option also accepts a `ReadonlyArray<RocketsAuthInput>` to
 * build an authentication chain (see the field's JSDoc).
 */
export type RocketsAuthInput =
  | Type<AuthAdapterInterface>
  | AuthFeatureBundle
  | RocketsAuthIntegration;

export interface RocketsOptionsExtrasInterface
  extends Pick<DynamicModule, 'global' | 'controllers'> {
  enableGlobalGuard?: boolean;
  disableController?: DisableControllerOptionsInterface;

  /**
   * Authentication wiring. Must be provided — a Rockets app always
   * requires at least one auth adapter.
   *
   * Accepts a single entry or an array (chain). Per-entry shapes:
   *  - `Type<AuthAdapterInterface>` — bare adapter; core auto-pushes as provider.
   *  - `AuthFeatureBundle` — from `defineAuthFeature()`; its resource is
   *    merged into `resources[]`.
   *  - `RocketsAuthIntegration` — from `defineRocketsAuth()` /
   *    `defineFirebaseAuth()` / etc.; `nestImports` append after core;
   *    `resources` merged into the planner.
   *
   * When an array is passed, every entry's wiring is merged and the
   * resulting chain is iterated by `AuthServerGuard` in declaration
   * order. The first adapter that returns `matched: true` wins; if it
   * returned a rejection error, the chain stops and that error is
   * thrown — by design, to avoid surprising credential passthroughs.
   */
  auth?: RocketsAuthInput | ReadonlyArray<RocketsAuthInput>;

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
