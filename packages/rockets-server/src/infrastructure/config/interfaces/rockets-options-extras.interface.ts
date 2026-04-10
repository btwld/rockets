import { DynamicModule, Type } from '@nestjs/common';
import type {
  AbstractUpsertUserMetadataHandler,
  AbstractGetUserMetadataHandler,
  RepositoryPersistenceConfig,
  RocketsResourceConfig,
} from '@bitwild/rockets-core';

export interface DisableControllerOptionsInterface {
  me?: boolean;
}

export interface RocketsOptionsExtrasInterface
  extends Pick<DynamicModule, 'global' | 'controllers'> {
  enableGlobalGuard?: boolean;
  disableController?: DisableControllerOptionsInterface;

  /** Repository persistence — array of adapter configs, each registers entities */
  repositoryPersistence?: ReadonlyArray<RepositoryPersistenceConfig>;

  /**
   * Optional custom handler overrides for user metadata operations.
   * Each must extend the corresponding abstract base class.
   */
  handlers?: {
    upsertUserMetadata?: Type<AbstractUpsertUserMetadataHandler>;
    getUserMetadata?: Type<AbstractGetUserMetadataHandler>;
  };

  /** Declarative CRUD resources — passed through to RocketsCoreModule */
  resources?: ReadonlyArray<RocketsResourceConfig>;
}
