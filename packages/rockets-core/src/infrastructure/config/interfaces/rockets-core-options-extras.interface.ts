import type { DynamicModule, Provider, Type } from '@nestjs/common';
import type { RocketsRepositoriesConfig } from '../../../domain/interfaces/rockets-repositories.interface';
import type { RocketsResourceInput } from '../../resource/aggregate-resources';
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
   * Declarative CRUD resources. Accepts either:
   * - `RocketsResourceBundle` values from `defineResource()` (auto-contribute
   *   their entity to persistence), or
   * - Raw `RocketsResourceConfig` objects (consumer registers entity via
   *   `repositories.entities`).
   *
   * Core aggregates bundles internally — no pre-processing needed.
   */
  readonly resources?: ReadonlyArray<RocketsResourceInput>;

  readonly handlers?: {
    readonly upsertUserMetadata?: Type<AbstractUpsertUserMetadataHandler>;
    readonly getUserMetadata?: Type<AbstractGetUserMetadataHandler>;
  };
}
