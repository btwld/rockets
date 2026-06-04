// ── Re-export core contracts & tokens ──
export {
  AUTH_ADAPTERS_TOKEN,
  ROCKETS_DISABLE_GUARDS_TOKEN,
  AuthServerGuard,
  extractBearerToken,
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
  AuthAdapterInterface,
  AuthAttemptResult,
  AuthRequest,
  AuthorizedUser,
  RepositoryPersistenceConfig,
  RocketsUserMetadataConfig,
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
export { logAndGetErrorDetails, getErrorDetails } from '@bitwild/rockets-app';
export type { ErrorDetails } from '@bitwild/rockets-app';

// ── Backward compatibility re-exports ──
export { ROCKETS_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN } from './rockets.constants';
export { ExceptionsFilter } from './infrastructure/filters/exceptions.filter';

// ── Server's own exports ──
export { RocketsModule } from './rockets.module';
export type {
  RocketsOptions,
  RocketsAsyncOptions,
} from './rockets.module-definition';
export type { RocketsOptionsInterface } from './infrastructure/config/interfaces/rockets-options.interface';
export type {
  RocketsOptionsExtrasInterface,
  DisableControllerOptionsInterface,
  RocketsAuthInput,
} from './infrastructure/config/interfaces/rockets-options-extras.interface';
export { UserModule } from './user.module';
export { MeController } from './gateways/http/me.controller';

// ── Declarative resource definition (re-exported from core) ──
export {
  defineResource,
  defineModuleResource,
  isModuleResource,
  ResourceKind,
  createPaginatedDto,
  buildAppRegistrationPlan,
  isCrudResource,
  relation,
  createBoundRelation,
  resolveRelationTarget,
  defineSubResource,
  isSubResourceDefinition,
  PathScopeHook,
} from '@bitwild/rockets-core';
export type {
  AppRegistrationPlan,
  ResourceInput,
  RocketsResourceDefinition,
  ResourceDtoConfig,
  ResourceRelationEntry,
  ResourcePersistenceConfigDefinition as ResourcePersistenceConfig,
  ResourceHandlerOverrides,
  ResourceOperationName,
  ResourceOperationConfig,
  ResourceDeleteOperationConfig,
  ResourceRestoreOperationConfig,
  ResourceOperationsObject,
  RocketsSubResourceDefinition,
  RocketsSubResourceInput,
  CrudResource,
  ModuleResource,
  ModuleResourceEntityEntry,
  DefineModuleResourceInput,
  BoundRelation,
  EntityConstructor,
  RelationOptions,
} from '@bitwild/rockets-core';
