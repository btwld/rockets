// ── Re-export core contracts & tokens ──
export {
  AUTH_ADAPTERS_TOKEN,
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
  OwnerStampHook,
  OwnerScopeHook,
  InjectDynamicRepository,
  Where,
  getDynamicRepositoryToken,
  RepositoryModule,
  defineAuthAdapter,
  AuthUser,
  ActorCtx,
  getActor,
  getCrudContext,
  EntityHook,
  EntityHookBase,
  PassthroughEntityHookBase,
} from '@concepta/rockets-core';

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
  AuthBootstrap,
  RepositoryBootstrap,
  RepositoryInterface,
  RepositoryModuleInterface,
  SchemaEntityCompiler,
  SchemaEntityCompilerOptions,
  Actor,
  ActorType,
  ActorContext,
  WithActor,
  EntityHookContext,
  RocketsCrudContext,
  DefineAuthAdapterOptions,
} from '@concepta/rockets-core';

export { isRepositoryBootstrap } from '@concepta/rockets-core';

// ── Re-export common utilities ──
export { Ctx } from '@concepta/nestjs-core';
export type { AppContextInterface } from '@concepta/nestjs-core';

// ── Backward compatibility re-export ──
export { ExceptionsFilter } from './infrastructure/filters/exceptions.filter';

// ── Server's own exports ──
export { RocketsModule } from './rockets.module';
export { createServer } from './create-server';
export type {
  RocketsOptions,
  RocketsAsyncOptions,
} from './rockets.module-definition';
export type { RocketsOptionsInterface } from './infrastructure/config/interfaces/rockets-options.interface';
export type {
  RocketsOptionsExtrasInterface,
  DisableControllerOptionsInterface,
  RocketsAuthOption,
} from './infrastructure/config/interfaces/rockets-options-extras.interface';
export { UserModule } from './user.module';
export { buildMeController } from './gateways/http/build-me-controller';
export { meResponseSchema, meUpdateSchema } from './gateways/http/me.schemas';
export {
  logAndGetErrorDetails,
  getErrorDetails,
  SwaggerUiService,
} from '@concepta/rockets-core';
export type {
  ErrorDetails,
  RocketsRepositoryModuleInterface,
} from '@concepta/rockets-core';

// ── Declarative resource definition (re-exported from core) ──
export {
  defineResource,
  defineModuleResource,
  isModuleResource,
  ResourceKind,
  buildAppRegistrationPlan,
  isCrudResource,
  relation,
  createBoundRelation,
  resolveRelationTarget,
  defineSubResource,
  isSubResourceDefinition,
  PathScopeHook,
} from '@concepta/rockets-core';
export type {
  AppRegistrationPlan,
  ResourceInput,
  RocketsResourceDefinition,
  ResourceDtoConfig,
  ResourceRelationEntry,
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
} from '@concepta/rockets-core';
