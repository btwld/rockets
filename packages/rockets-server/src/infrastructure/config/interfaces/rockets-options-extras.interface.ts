import { DynamicModule, Type } from '@nestjs/common';
import type {
  RoutePolicy,
  AbstractUpsertUserMetadataHandler,
  AbstractGetUserMetadataHandler,
  AuthBootstrap,
  RepositoryBootstrap,
  RepositoryModuleInterface,
  ResourceInput,
  RocketsAccessControlConfig,
  RocketsActorOptions,
  RocketsUserMetadataConfig,
} from '@concepta/rockets-core';

export interface DisableControllerOptionsInterface {
  me?: boolean;
}

export type RocketsAuthOption = AuthBootstrap | ReadonlyArray<AuthBootstrap>;

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
   * persistence / Nest wiring), `defineSubResource()` /
   * `defineOperationResource()` / `operationResource()`, and hand-built
   * `RocketsResourceConfig`.
   */
  resources?: ReadonlyArray<ResourceInput>;

  /**
   * Opt-in access control, forwarded to `RocketsCoreModule`. When set,
   * core registers the upstream `AccessControlModule` (rules/settings,
   * service, guard, query services); when omitted, no ACL wiring exists.
   */
  accessControl?: RocketsAccessControlConfig;
  /**
   * Route policy audit, forwarded to `RocketsCoreModule` verbatim.
   *
   * Declared here because the audit's whole point is coverage of
   * controllers the app did not write — `MeController` included — and
   * those only exist in apps composed through THIS module, where the
   * consumer never touches `RocketsCoreModule.forRoot` directly.
   *
   * `AuthServerGuard` and upstream `AccessControlGuard` are recognised
   * automatically. Integration-owned authentication and authorization
   * guards are contributed by their bootstrap or can be listed explicitly
   * in `authGuards` / `aclGuards`.
   *
   * Omitting it is not "no audit": core merges
   * `{ requireAuthGuard: true }` under whatever you pass. The pairing
   * that fails a boot is `enableGlobalGuard: false` with no
   * integration-contributed guard and no `authGuards` — an app with
   * nothing authenticating it, which is exactly the state this default
   * exists to stop shipping silently.
   */
  routePolicy?: RoutePolicy;

  /**
   * How the authenticated user becomes the request's `Actor`, forwarded to
   * `RocketsCoreModule` verbatim.
   */
  actor?: RocketsActorOptions;
}
