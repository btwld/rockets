export type {
  RocketsOptionsInterface,
  UserMetadataConfigInterface,
} from './interfaces/rockets-options.interface';
export type {
  RocketsOptionsExtrasInterface,
  DisableControllerOptionsInterface,
} from './interfaces/rockets-options-extras.interface';

export { AuthServerGuard } from './guards/auth-server.guard';
export { AuthProviderInterface } from './interfaces/auth-provider.interface';
export { AuthorizedUser } from './interfaces/auth-user.interface';

export { ExceptionsFilter } from './filter/exceptions.filter';

export { UserUpdateDto, UserResponseDto } from './modules/user/user.dto';
export {
  BaseUserEntityInterface,
  UserEntityInterface,
  UserCreatableInterface,
  UserUpdatableInterface,
  UserModelUpdatableInterface,
  BaseUserDto,
  BaseUserCreateDto,
  BaseUserUpdateDto,
} from './modules/user/interfaces/user.interface';
export { UserModule } from './modules/user/user.module';

export {
  BaseUserMetadataEntityInterface,
  UserMetadataEntityInterface,
  UserMetadataCreatableInterface,
  UserMetadataUpdatableInterface,
  UserMetadataModelUpdatableInterface,
  UserMetadataModelServiceInterface,
  BaseUserMetadataDto,
  BaseUserMetadataCreateDto,
  BaseUserMetadataUpdateDto,
} from './modules/user-metadata/interfaces/user-metadata.interface';
export {
  UserMetadataModelService,
  USER_METADATA_MODULE_ENTITY_KEY,
} from './modules/user-metadata/constants/user-metadata.constants';

export { RocketsModule } from './rockets.module';

export {
  logAndGetErrorDetails,
  getErrorDetails,
  ErrorDetails,
} from './utils/error-logging.helper';
