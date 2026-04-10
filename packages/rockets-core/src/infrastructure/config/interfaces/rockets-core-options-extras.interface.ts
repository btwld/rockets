import type { DynamicModule, Provider, Type } from '@nestjs/common';
import type { RepositoryPersistenceConfig } from '../../../domain/interfaces/repository-persistence.interface';
import type { RocketsResourceConfig } from '../../../domain/interfaces/rockets-resource.interface';
import type { AbstractUpsertUserMetadataHandler } from '../../../application/commands/handlers/abstract-upsert-user-metadata.handler';
import type { AbstractGetUserMetadataHandler } from '../../../application/queries/handlers/abstract-get-user-metadata.handler';

export interface RocketsCoreOptionsExtrasInterface
  extends Pick<DynamicModule, 'global'> {
  readonly repositoryPersistence?: ReadonlyArray<RepositoryPersistenceConfig>;
  readonly providers?: Provider[];

  /** Declarative CRUD resources — core does pass-through to RepositoryModule + CrudModule */
  readonly resources?: ReadonlyArray<RocketsResourceConfig>;

  readonly handlers?: {
    readonly upsertUserMetadata?: Type<AbstractUpsertUserMetadataHandler>;
    readonly getUserMetadata?: Type<AbstractGetUserMetadataHandler>;
  };
}
