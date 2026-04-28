import type { DynamicModule, Provider, Type } from '@nestjs/common';
import type { RocketsRepositoriesConfig } from '../../../domain/interfaces/rockets-repositories.interface';
import type { ResourceDefinitionInput } from '../../resource/aggregate-resources';
import type { AbstractUpsertUserMetadataHandler } from '../../../application/commands/handlers/abstract-upsert-user-metadata.handler';
import type { AbstractGetUserMetadataHandler } from '../../../application/queries/handlers/abstract-get-user-metadata.handler';

export interface RocketsCoreOptionsExtrasInterface
  extends Pick<DynamicModule, 'global'> {
  /**
   * Unified repository config. Core auto-registers all entities via
   * `RepositoryModule.forFeature()`.
   *
   * Includes `userMetadata` (required by core handlers) and an optional
   * `entities` array for additional standalone entities.
   *
   * Omit when an upstream module (e.g. rockets-auth) already handles
   * repository registration.
   */
  readonly repositories?: RocketsRepositoriesConfig;

  readonly providers?: Provider[];

  /**
   * Your app’s CRUD “resources” list.
   *
   * - Prefer `defineResource()` when you want Rockets to wire the entity for you.
   * - You can also pass a hand-built `RocketsResourceConfig`, but then you must
   *   add that entity to `repositories` yourself (Rockets can’t infer it).
   */
  readonly resources?: ReadonlyArray<ResourceDefinitionInput>;

  readonly handlers?: {
    readonly upsertUserMetadata?: Type<AbstractUpsertUserMetadataHandler>;
    readonly getUserMetadata?: Type<AbstractGetUserMetadataHandler>;
  };
}
