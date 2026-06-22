// Module
export { RocketsCoreModule } from './rockets-core.module';

// Auth contracts
export type {
  AuthAdapterInterface,
  AuthAttemptResult,
  AuthRequest,
} from './domain/interfaces/auth-adapter.interface';
export type { AuthorizedUser } from './domain/interfaces/auth-user.interface';

// Auth helpers
export { extractBearerToken } from './infrastructure/auth/extract-bearer-token';

// Auth tokens & guard
export {
  AUTH_ADAPTERS_TOKEN,
  ROCKETS_DISABLE_GUARDS_TOKEN,
} from './rockets-core.constants';
export { AuthServerGuard } from './infrastructure/guards/auth-server.guard';
export { PathScopeGuard } from './infrastructure/guards/path-scope.guard';

// Decorators
export { AuthPublic } from './decorators/auth-public.decorator';
// Canonical authenticated-user param decorator (reads `request.user`).

// Auth user-context overlay — re-exported so downstream layers consume it
// through core instead of depending on `@concepta/nestjs-authentication`.
// Core registers `AuthUserContextOverlay` as a global APP_INTERCEPTOR.
export {
  AuthUserContextOverlay,
  AuthUserCtx,
} from '@concepta/nestjs-authentication';

// Actor overlay (transport-agnostic identity of "who" performed the op)
export type {
  Actor,
  ActorType,
  ActorContext,
  WithActor,
} from './domain/interfaces/actor.interface';
export {
  ActorCtx,
  ActorOverlay,
} from './infrastructure/interceptors/actor.overlay';
export { getActor, getCrudContext } from './utils/get-actor.helper';

// Entity hook base + class decorator (typed lifecycle for repo hooks)
export {
  EntityHook,
  EntityHookBase,
  PassthroughEntityHookBase,
  type EntityHookContext,
  type EntityHookLifecycleKey,
  type OwnedEntity,
  type RocketsEntityHookForResource,
} from './infrastructure/hooks/entity-hook';
export type { RocketsCrudContext } from './domain/interfaces/rockets-crud-context.interface';

// Functional hook authoring — turns lifecycle functions into an
// `@EntityHook`-decorated, DI-ready class (sugar over PassthroughEntityHookBase).
export {
  defineHook,
  type EntityHookFns,
  type EntityHookTools,
} from './infrastructure/hooks/define-hook';

// Reusable repository hooks
export {
  OwnerScopeHook,
  DEFAULT_OWNER_COLUMN,
} from './infrastructure/hooks/owner-scope.hook';
export { OwnerStampHook } from './infrastructure/hooks/owner-stamp.hook';
export { AfterCreateReloadHook } from './infrastructure/hooks/after-create-reload.hook';

// Exceptions filter
export {
  RocketsCoreExceptionsFilter,
  ERROR_MESSAGE_FALLBACK,
} from './infrastructure/filters/exceptions.filter';

/** Safe global substitute for upstream `CrudContextOverlay` on mixed CRUD + bespoke routes. */
export { SafeCrudContextInterceptor } from './infrastructure/interceptors/safe-crud-context.interceptor';

// Repository persistence interfaces
export type { RepositoryPersistenceConfig } from './domain/interfaces/repository-persistence.interface';
export type { RepositoryBootstrap } from './domain/interfaces/repository-bootstrap.interface';
export { isRepositoryBootstrap } from './domain/interfaces/repository-bootstrap.interface';

// Repository abstraction primitives — re-exported so downstream layers
// (`rockets`, `rockets-server-auth`) consume the persistence contract through
// core and never depend on `@bitwild/rockets-repository` directly.
export type {
  RepositoryModuleInterface,
  RepositoryInterface,
} from '@bitwild/rockets-repository';
export {
  RepositoryModule,
  Where,
  getDynamicRepositoryToken,
} from '@bitwild/rockets-repository';

// Module resource (non-CRUD persistence + Nest module slice)
export type {
  ModuleResource,
  ModuleResourceEntityEntry,
} from './domain/interfaces/module-resource.interface';
export { ResourceKind } from './domain/interfaces/resource-kind.enum';
export {
  defineModuleResource,
  isModuleResource,
} from './infrastructure/resource/define-module-resource';
export type { DefineModuleResourceInput } from './infrastructure/resource/define-module-resource';

// Auth bootstrap (light / external auth wiring)
export type { AuthBootstrap } from './domain/interfaces/auth-bootstrap.interface';
export { createStubAuthBootstrap } from './infrastructure/auth/create-stub-auth-bootstrap';

// Resource config & definition API
export type { RocketsResourceConfig } from './domain/interfaces/rockets-resource.interface';
export { defineResource } from './infrastructure/resource/define-resource';
export {
  defineSubResource,
  isSubResourceDefinition,
  defaultParentParam,
  type RocketsSubResourceInput,
} from './infrastructure/resource/define-sub-resource';
export { PathScopeHook } from './infrastructure/hooks/path-scope.hook';
export type { RocketsUserMetadataConfig } from './domain/interfaces/rockets-user-metadata-config.interface';
export { createPaginatedDto } from './infrastructure/resource/paginated-dto.factory';
export {
  relation,
  createBoundRelation,
  resolveRelationTarget,
} from './infrastructure/resource/relation';
export type {
  BoundRelation,
  RelationOptions,
} from './domain/interfaces/rockets-resource-definition.interface';
export {
  buildAppRegistrationPlan,
  isCrudResource,
} from './infrastructure/resource/aggregate-resources';
export type {
  AppRegistrationPlan,
  ResourceInput,
} from './infrastructure/resource/aggregate-resources';
export type {
  RocketsResourceDefinition,
  ResourceDtoConfig,
  ResourceRelationEntry,
  ResourceHandlerOverrides,
  ResourceOperationName,
  ResourceOperationConfig,
  ResourceDeleteOperationConfig,
  ResourceRestoreOperationConfig,
  ResourceOperationsObject,
  EntityConstructor,
  RocketsSubResourceDefinition,
} from './domain/interfaces/rockets-resource-definition.interface';
export type { CrudResource } from './domain/interfaces/rockets-resource-bundle.interface';

// Swagger (re-exported so consumers don't need @bitwild/rockets-app directly)

// Options interfaces
export type { RocketsCoreOptionsInterface } from './infrastructure/config/interfaces/rockets-core-options.interface';
export type { RocketsCoreOptionsExtrasInterface } from './infrastructure/config/interfaces/rockets-core-options-extras.interface';
export type { RocketsCoreSettingsInterface } from './infrastructure/config/interfaces/rockets-core-settings.interface';

// User entity contracts
export type {
  BaseUserEntityInterface,
  UserEntityInterface,
  UserCreatableInterface,
  UserUpdatableInterface,
  UserModelUpdatableInterface,
} from './domain/interfaces/user.interface';
export {
  BaseUserDto,
  BaseUserCreateDto,
  BaseUserUpdateDto,
} from './domain/interfaces/user.interface';

// User metadata contracts
export type {
  BaseUserMetadataEntityInterface,
  UserMetadataEntityInterface,
  UserMetadataCreatableInterface,
  UserMetadataUpdatableInterface,
  UserMetadataModelUpdatableInterface,
} from './domain/interfaces/user-metadata.interface';
export {
  BaseUserMetadataDto,
  BaseUserMetadataCreateDto,
  BaseUserMetadataUpdateDto,
} from './domain/interfaces/user-metadata.interface';

// DTOs
export {
  UserUpdateDto,
  UserResponseDto,
  RoleNameDto,
  UserRoleItemDto,
} from './infrastructure/dtos/user.dto';

// CQRS commands
export { UpsertUserMetadataCommand } from './application/commands/impl/upsert-user-metadata.command';
export { AbstractUpsertUserMetadataHandler } from './application/commands/handlers/abstract-upsert-user-metadata.handler';
export { UpsertUserMetadataHandler } from './application/commands/handlers/upsert-user-metadata.handler';

// CQRS queries
export { GetUserMetadataQuery } from './application/queries/impl/get-user-metadata.query';
export { AbstractGetUserMetadataHandler } from './application/queries/handlers/abstract-get-user-metadata.handler';
export { GetUserMetadataHandler } from './application/queries/handlers/get-user-metadata.handler';
export {
  AuthUser,
  type SchemaEntityCompiler,
  type SchemaEntityCompilerOptions,
  InjectDynamicRepository,
  type SwaggerUiOptionsInterface,
} from '@bitwild/rockets-common';

// Constants
export {
  USER_METADATA_MODULE_ENTITY_KEY,
  USER_MODULE_USER_ENTITY_KEY,
  ROCKETS_CORE_SETTINGS_TOKEN,
} from './rockets-core.constants';
