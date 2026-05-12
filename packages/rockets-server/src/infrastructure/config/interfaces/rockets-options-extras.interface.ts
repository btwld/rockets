import { DynamicModule, Type } from '@nestjs/common';
import type { RepositoryModuleInterface } from '@concepta/nestjs-repository';
import type {
  AbstractUpsertUserMetadataHandler,
  AbstractGetUserMetadataHandler,
  AuthAdapterInterface,
  AuthFeatureBundle,
  RepositoryBootstrap,
  ResourceInput,
  RocketsUserMetadataConfig,
} from '@bitwild/rockets-core';

export interface DisableControllerOptionsInterface {
  me?: boolean;
}

export interface RocketsOptionsExtrasInterface
  extends Pick<DynamicModule, 'global' | 'controllers'> {
  enableGlobalGuard?: boolean;
  disableController?: DisableControllerOptionsInterface;

  /**
   * Auth adapter, accepted in two forms:
   *
   * - `Type<AuthAdapterInterface>` — a bare class. The caller is
   *   responsible for registering it as a Nest provider (typically
   *   inside the `defineModuleResource()` that owns the user entity).
   * - `AuthFeatureBundle` — produced by `defineAuthFeature()`
   *   (or a sample wrapper like `defineSampleAuth()`). The bundle
   *   carries both the adapter class and the module resource that
   *   owns its entity / controllers / providers; the module resource
   *   is auto-prepended to `resources[]`, so the caller does not list
   *   the auth feature twice.
   */
  auth?: Type<AuthAdapterInterface> | AuthFeatureBundle;

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
