import { RepositoryEntityOptionInterface } from '@concepta/nestjs-repository';
import {
  UserEntityInterface,
  UserEntityInterface as UserMetadataEntityInterface,
} from '@concepta/nestjs-common';
import { UserPasswordHistoryEntityInterface } from '@concepta/nestjs-common/dist/domain/user-password-history/interfaces/user-password-history-entity.interface';

export interface RocketsAuthEntitiesOptionsInterface {
  entities: {
    user: RepositoryEntityOptionInterface<UserEntityInterface>;
    userPasswordHistory?: RepositoryEntityOptionInterface<UserPasswordHistoryEntityInterface>;
    userMetadata?: RepositoryEntityOptionInterface<UserMetadataEntityInterface>;
    userOtp: RepositoryEntityOptionInterface;
  };
}
