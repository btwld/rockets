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
   * Auth adapter class. The class must be registered as a Nest provider
   * somewhere reachable in DI (typically inside a `defineModuleResource()`
   * resource that owns the user entity). Core aliases the registered
   * class to `AUTH_ADAPTER_TOKEN` via `useExisting`.
   */
  readonly auth?: Type<AuthAdapterInterface>;
  /**
   * Set by `rockets-server` when `auth` was wired through an
   * `AuthFeatureBundle` or `RocketsAuthIntegration` — both of which
   * already register the adapter class through their own module
   * (a resource feature module or a global dynamic module imported
   * via `nestImports`). When true, core skips its own
   * `providers: [auth, ...]` push and just creates the
   * `AUTH_ADAPTER_TOKEN` alias.
   *
   * Without this flag, an externally-provided adapter (e.g. the
   * Firebase adapter, whose constructor needs `FIREBASE_TOKEN_VERIFIER_TOKEN`
   * provided only by `FirebaseAuthModule`) gets a second instance
   * created inside core where its deps aren't reachable, throwing
   * `Nest can't resolve dependencies` at boot.
   */
  readonly authExternallyProvided?: boolean;
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
