// ── Re-export core contracts & tokens ──
export {
  AUTH_PROVIDER_TOKEN,
  ROCKETS_DISABLE_GUARDS_TOKEN,
  AuthServerGuard,
  AuthPublic,
  RocketsCoreModule,
  UpsertUserMetadataCommand,
  AbstractUpsertUserMetadataHandler,
  UpsertUserMetadataHandler,
  GetUserMetadataQuery,
  AbstractGetUserMetadataHandler,
  GetUserMetadataHandler,
  USER_METADATA_MODULE_ENTITY_KEY,
  USER_MODULE_USER_ENTITY_KEY,
  ROCKETS_CORE_SETTINGS_TOKEN,
  RocketsCoreExceptionsFilter,
  BaseUserDto,
  BaseUserCreateDto,
  BaseUserUpdateDto,
  BaseUserMetadataDto,
  BaseUserMetadataCreateDto,
  BaseUserMetadataUpdateDto,
  UserUpdateDto,
  UserResponseDto,
  RoleNameDto,
  UserRoleItemDto,
} from '@bitwild/rockets-core';

export type {
  AuthProviderInterface,
  AuthorizedUser,
  AuthorizeUserInterface,
  ValidateTokenInterface,
  RepositoryPersistenceConfig,
  RocketsCoreOptionsInterface,
  RocketsCoreOptionsExtrasInterface,
  RocketsCoreSettingsInterface,
  BaseUserEntityInterface,
  UserEntityInterface,
  UserCreatableInterface,
  UserUpdatableInterface,
  UserModelUpdatableInterface,
  BaseUserMetadataEntityInterface,
  UserMetadataEntityInterface,
  UserMetadataCreatableInterface,
  UserMetadataUpdatableInterface,
  UserMetadataModelUpdatableInterface,
} from '@bitwild/rockets-core';

// ── Re-export common utilities ──
export { logAndGetErrorDetails, getErrorDetails } from '@bitwild/rockets-common';
export type { ErrorDetails } from '@bitwild/rockets-common';

// ── Backward compatibility re-exports ──
export {
  RocketsAuthProvider,
  ROCKETS_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN,
  UserModelService,
} from './rockets.constants';
export { ExceptionsFilter } from './infrastructure/filters/exceptions.filter';

// ── Server's own exports ──
export { RocketsModule } from './rockets.module';
export type {
  RocketsOptionsInterface,
  UserMetadataConfigInterface,
} from './infrastructure/config/interfaces/rockets-options.interface';
export type {
  RocketsOptionsExtrasInterface,
  DisableControllerOptionsInterface,
} from './infrastructure/config/interfaces/rockets-options-extras.interface';
export { UserModule } from './user.module';
export { MeController } from './gateways/http/me.controller';
