import { RepositoryContextInterface } from '@bitwild/rockets-app';
import { RocketsAuthUserMetadataEntityInterface } from '../../interfaces/rockets-auth-user-metadata-entity.interface';
import { RocketsAuthUserMetadataUpdatableInterface } from '../../interfaces/rockets-auth-user-metadata-updatable.interface';

export interface UserMetadataRepositoryInterface {
  findByUserId(
    ctx: RepositoryContextInterface,
    userId: string,
  ): Promise<RocketsAuthUserMetadataEntityInterface | null>;

  save(
    ctx: RepositoryContextInterface,
    userId: string,
    data: RocketsAuthUserMetadataUpdatableInterface,
  ): Promise<RocketsAuthUserMetadataEntityInterface>;
}
