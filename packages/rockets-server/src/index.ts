// Export configuration types
export type {
  RocketsOptionsInterface,
  UserMetadataConfigInterface,
} from './interfaces/rockets-options.interface';
export type {
  RocketsOptionsExtrasInterface,
  DisableControllerOptionsInterface,
} from './interfaces/rockets-options-extras.interface';

// Export auth components
export { AuthServerGuard } from './guards/auth-server.guard';
export { AuthProviderInterface } from './interfaces/auth-provider.interface';
export { AuthorizedUser } from './interfaces/auth-user.interface';

// Export filters
export { ExceptionsFilter } from './filter/exceptions.filter';

// Export user components
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

// Export userMetadata components (for advanced usage)
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

// Export main module
export { RocketsModule } from './rockets.module';

// Export utils
export {
  logAndGetErrorDetails,
  getErrorDetails,
  ErrorDetails,
} from './utils/error-logging.helper';
