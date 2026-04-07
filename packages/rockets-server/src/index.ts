export type {
  RocketsOptionsInterface,
  UserMetadataConfigInterface,
} from './infrastructure/config/interfaces/rockets-options.interface';
export type {
  RocketsOptionsExtrasInterface,
  DisableControllerOptionsInterface,
} from './infrastructure/config/interfaces/rockets-options-extras.interface';

export { AuthServerGuard } from './infrastructure/guards/auth-server.guard';
export { AuthProviderInterface } from './domain/interfaces/auth-provider.interface';
export { AuthorizedUser } from './domain/interfaces/auth-user.interface';

export { ExceptionsFilter } from './infrastructure/filters/exceptions.filter';

export { UserUpdateDto, UserResponseDto } from './infrastructure/dtos/user.dto';
export {
  BaseUserEntityInterface,
  UserEntityInterface,
  UserCreatableInterface,
  UserUpdatableInterface,
  UserModelUpdatableInterface,
  BaseUserDto,
  BaseUserCreateDto,
  BaseUserUpdateDto,
} from './domain/interfaces/user.interface';
export { UserModule } from './user.module';

export {
  BaseUserMetadataEntityInterface,
  UserMetadataEntityInterface,
  UserMetadataCreatableInterface,
  UserMetadataUpdatableInterface,
  UserMetadataModelUpdatableInterface,
  BaseUserMetadataDto,
  BaseUserMetadataCreateDto,
  BaseUserMetadataUpdateDto,
} from './domain/interfaces/user-metadata.interface';
export { USER_METADATA_MODULE_ENTITY_KEY } from './rockets.constants';

export { AbstractUpsertUserMetadataHandler } from './application/commands/handlers/abstract-upsert-user-metadata.handler';
export { AbstractGetUserMetadataHandler } from './application/queries/handlers/abstract-get-user-metadata.handler';
export { UpsertUserMetadataCommand } from './application/commands/impl/upsert-user-metadata.command';
export { GetUserMetadataQuery } from './application/queries/impl/get-user-metadata.query';

export { RocketsModule } from './rockets.module';

export {
  logAndGetErrorDetails,
  getErrorDetails,
  ErrorDetails,
} from './infrastructure/utils/error-logging.helper';
