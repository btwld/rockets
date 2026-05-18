// DTOs
export { RocketsAuthUserDto } from './infrastructure/dto/rockets-auth-user.dto';
export { RocketsAuthUserCreateDto } from './infrastructure/dto/rockets-auth-user-create.dto';
export { RocketsAuthUserUpdateDto } from './infrastructure/dto/rockets-auth-user-update.dto';
export { RocketsAuthUserMetadataDto } from './infrastructure/dto/rockets-auth-user-metadata.dto';

// Interfaces
export { RocketsAuthUserInterface } from './interfaces/rockets-auth-user.interface';
export { RocketsAuthUserEntityInterface } from './interfaces/rockets-auth-user-entity.interface';
export { RocketsAuthUserCreatableInterface } from './interfaces/rockets-auth-user-creatable.interface';
export { RocketsAuthUserUpdatableInterface } from './interfaces/rockets-auth-user-updatable.interface';
export { RocketsAuthUserMetadataEntityInterface } from './interfaces/rockets-auth-user-metadata-entity.interface';
export { RocketsAuthUserMetadataCreatableInterface as RocketsAuthUserMetadataCreateDtoInterface } from './interfaces/rockets-auth-user-metadata-creatable.interface';

// DDD Domain Exceptions
export {
  UserException,
  DuplicateUserException,
} from './domain/exceptions/user.exception';

// DDD Domain Repository Interfaces
export { UserMetadataRepositoryInterface } from './domain/repositories/user-metadata-repository.interface';

// DDD Application Commands
export { SignupUserCommand } from './application/commands/impl/signup-user.command';
export { SaveUserMetadataCommand } from './application/commands/impl/save-user-metadata.command';
export { UpdateUserCommand } from './application/commands/impl/update-user.command';

// DDD Application Queries
export { GetUserQuery } from './application/queries/impl/get-user.query';
export { GetUserMetadataQuery } from './application/queries/impl/get-user-metadata.query';
export { GetActiveCredentialQuery } from './application/queries/impl/get-active-credential.query';
export { GetActiveCredentialHandler } from './application/queries/handlers/get-active-credential.handler';

// Rockets-level User Queries (clean, no ctx)
export { RocketsGetUserByEmailQuery } from './application/queries/impl/rockets-get-user-by-email.query';
export { RocketsGetUserByEmailHandler } from './application/queries/handlers/rockets-get-user-by-email.handler';
export { RocketsGetUserByUsernameQuery } from './application/queries/impl/rockets-get-user-by-username.query';
export { RocketsGetUserByUsernameHandler } from './application/queries/handlers/rockets-get-user-by-username.handler';
export { RocketsAuthUserPortGetByUsernameQuery } from './application/queries/impl/rockets-auth-user-port-get-by-username.query';
export { RocketsAuthUserPortGetByUsernameHandler } from './application/queries/handlers/rockets-auth-user-port-get-by-username.handler';
export { RocketsGetUserBySubjectQuery } from './application/queries/impl/rockets-get-user-by-subject.query';
export { RocketsGetUserBySubjectHandler } from './application/queries/handlers/rockets-get-user-by-subject.handler';
export { RocketsGetUserByIdQuery } from './application/queries/impl/rockets-get-user-by-id.query';
export { RocketsGetUserByIdHandler } from './application/queries/handlers/rockets-get-user-by-id.handler';

// Rockets-level User Commands (clean, no ctx)
export { RocketsCreateUserCommand } from './application/commands/impl/rockets-create-user.command';
export { RocketsCreateUserHandler } from './application/commands/handlers/rockets-create-user.handler';
export { RocketsUpdateUserCommand } from './application/commands/impl/rockets-update-user.command';
export { RocketsUpdateUserHandler } from './application/commands/handlers/rockets-update-user.handler';

// DDD Application Handlers
export { AbstractSignupUserHandler } from './application/commands/handlers/abstract-signup-user.handler';
export { SignupUserHandler } from './application/commands/handlers/signup-user.handler';
export { SaveUserMetadataHandler } from './application/commands/handlers/save-user-metadata.handler';
export { UpdateUserHandler } from './application/commands/handlers/update-user.handler';
export { GetUserHandler } from './application/queries/handlers/get-user.handler';
export { GetUserMetadataHandler } from './application/queries/handlers/get-user-metadata.handler';
// DDD Application Commands (Role)
export { AssignDefaultRoleCommand } from './application/commands/impl/assign-default-role.command';
export { AssignDefaultRoleHandler } from './application/commands/handlers/assign-default-role.handler';

// DDD Admin Handlers (concrete)
export { AdminUpdateUserHandler } from './application/commands/handlers/admin-update-user.handler';
export { AdminDeleteUserHandler } from './application/commands/handlers/admin-delete-user.handler';

// DDD Admin Abstract Handlers (for override)
export { AbstractAdminUserListHandler } from './application/commands/handlers/abstract-admin-user-list.handler';
export { AbstractAdminUserReadHandler } from './application/commands/handlers/abstract-admin-user-read.handler';
export { AbstractAdminUserUpdateHandler } from './application/commands/handlers/abstract-admin-user-update.handler';
export { AbstractAdminDeleteUserHandler } from './application/commands/handlers/abstract-admin-delete-user.handler';

// Domain Constants
export { USER_METADATA_REPOSITORY_TOKEN } from './domain/constants/user-domain.tokens';
export { USER_METADATA_MODULE_ENTITY_KEY } from '../../shared/constants/repository-entity-keys.constants';

// Modules
export { RocketsAuthAdminModule } from './modules/rockets-auth-admin.module';
export { RocketsAuthSignUpModule } from './modules/rockets-auth-signup.module';
export { RocketsAuthUserMetadataModule } from './modules/rockets-auth-user-metadata.module';
export {
  RocketsAuthUserMetadataModuleClass,
  RocketsAuthUserMetadataOptions,
  RocketsAuthUserMetadataAsyncOptions,
  RAW_USER_METADATA_OPTIONS_TOKEN,
} from './modules/rockets-auth-user-metadata.module-definition';
