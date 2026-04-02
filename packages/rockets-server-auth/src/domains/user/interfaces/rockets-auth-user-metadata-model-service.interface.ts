import { RepositoryInterface } from '@concepta/nestjs-repository';
import { RocketsAuthUserMetadataEntityInterface } from './rockets-auth-user-metadata-entity.interface';
import { RocketsAuthUserMetadataCreatableInterface } from './rockets-auth-user-metadata-creatable.interface';
import { RocketsAuthUserMetadataUpdatableInterface } from './rockets-auth-user-metadata-updatable.interface';

export interface RocketsAuthUserMetadataModelServiceInterface {
  readonly repo: RepositoryInterface<RocketsAuthUserMetadataEntityInterface>;
  readonly createDto: new () => RocketsAuthUserMetadataCreatableInterface;
  readonly updateDto: new () => RocketsAuthUserMetadataUpdatableInterface;

  byId(id: string): Promise<RocketsAuthUserMetadataEntityInterface | null>;

  findByUserId(
    userId: string,
  ): Promise<RocketsAuthUserMetadataEntityInterface | null>;

  createOrUpdate(
    userId: string,
    data: RocketsAuthUserMetadataUpdatableInterface,
  ): Promise<RocketsAuthUserMetadataEntityInterface>;

  updateUserMetadata(
    userId: string,
    userMetadataData: Partial<RocketsAuthUserMetadataUpdatableInterface>,
  ): Promise<RocketsAuthUserMetadataEntityInterface>;
}
