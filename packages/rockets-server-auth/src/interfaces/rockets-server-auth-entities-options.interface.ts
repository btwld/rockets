import {
  RepositoryEntityOptionInterface,
  UserEntityInterface,
  UserPasswordHistoryEntityInterface,
  UserProfileEntityInterface,
} from '@concepta/nestjs-common';

export interface RocketsServerAuthEntitiesOptionsInterface {
  entities: {
    user: RepositoryEntityOptionInterface<UserEntityInterface>;
    userPasswordHistory?: RepositoryEntityOptionInterface<UserPasswordHistoryEntityInterface>;
    userProfile?: RepositoryEntityOptionInterface<UserProfileEntityInterface>;
    userOtp: RepositoryEntityOptionInterface;
  };
}
