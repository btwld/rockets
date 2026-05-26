import type { DynamicModule, Provider, Type } from '@nestjs/common';
import type { RepositoryModuleInterface } from '@concepta/nestjs-repository';
import type { ResourceInput } from '../../resource/aggregate-resources';
import type { AuthAdapterInterface } from '../../../domain/interfaces/auth-adapter.interface';
import type { RepositoryBootstrap } from '../../../domain/interfaces/repository-bootstrap.interface';
import type { RocketsUserMetadataConfig } from '../../../domain/interfaces/rockets-user-metadata-config.interface';
import type { AbstractUpsertUserMetadataHandler } from '../../../application/commands/handlers/abstract-upsert-user-metadata.handler';
import type { AbstractGetUserMetadataHandler } from '../../../application/queries/handlers/abstract-get-user-metadata.handler';

export interface RocketsCoreOptionsExtrasInterface
  extends Pick<DynamicModule, 'global'> {
  /**
   * One or more auth adapter classes, in priority order. Each class must
   * be registered as a Nest provider somewhere reachable in DI (typically
   * inside the `defineModuleResource()` resource that owns the credential
   * entity, or in a global module pulled in via `nestImports`).
   *
   * Core registers the chain as {@link AUTH_ADAPTERS_TOKEN} (the array
   * the {@link AuthServerGuard} iterates). When a single `Type` is passed
   * it is normalised to a one-element chain.
   */
  readonly auth?:
    | Type<AuthAdapterInterface>
    | ReadonlyArray<Type<AuthAdapterInterface>>;
  /**
   * Tells core which adapters in the chain are already provided by a
   * module reachable in DI (e.g. a `RocketsAuthIntegration` whose
   * `nestImports` contain the providing module). For those, core skips
   * its own `providers: [adapter]` auto-push and only wires the DI
   * token. Computed automatically by `resolveAuthChain` — not for
   * direct user configuration.
   *
   * @internal
   */
  readonly authExternallyProvided?: boolean | ReadonlyArray<boolean>;
  /**
   * User-metadata config — single source of truth for the entity, the
   * create/update/response DTOs, and optional adapter override.
   */
  readonly userMetadata?: RocketsUserMetadataConfig;
  /**
   * Default persistence adapter (e.g. `TypeOrmRepositoryModule`).
   *
   * Every dynamic-repository registration contributed by `defineResource`
   * or `defineModuleResource` bundles flows through this adapter unless an
   * individual entry sets its own `repository` override.
   *
   * When the value also implements {@link RepositoryBootstrap}, core
   * additionally calls `repository.forRoot(entities)` with the union of
   * every entity registered through `resources[]` and `userMetadata` —
   * letting one factory own *both* the connection and the per-entity
   * registration without leaking an ORM into core.
   *
   * Omit when an upstream module (e.g. rockets-server-auth) already
   * registers all entities the app needs.
   */
  readonly repository?: RepositoryModuleInterface | RepositoryBootstrap;

  readonly providers?: Provider[];

  /**
   * Bundles describing the app's features.
   *
   * Accepts a mix of:
   * - `defineResource()` — CRUD-shaped surfaces (auto-generated controller
   *   + persistence row).
   * - `defineModuleResource()` — non-CRUD features that contribute
   *   persistence rows and/or a Nest module slice
   *   (controllers/providers/exports/imports).
   * - Hand-built `RocketsResourceConfig` — escape hatch for fully manual
   *   CRUD wiring (you must register the entity through another bundle so
   *   Rockets can validate relations).
   */
  readonly resources?: ReadonlyArray<ResourceInput>;

  readonly handlers?: {
    readonly upsertUserMetadata?: Type<AbstractUpsertUserMetadataHandler>;
    readonly getUserMetadata?: Type<AbstractGetUserMetadataHandler>;
  };
}
