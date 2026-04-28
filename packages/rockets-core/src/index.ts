// Module
export { RocketsCoreModule } from './rockets-core.module';

// Auth contracts
export type { AuthProviderInterface } from './domain/interfaces/auth-provider.interface';
export type {
  AuthorizeUserInterface,
  ValidateTokenInterface,
} from './domain/interfaces/auth-provider.interface';
export type { AuthorizedUser } from './domain/interfaces/auth-user.interface';

// Auth tokens & guard
export {
  AUTH_PROVIDER_TOKEN,
  ROCKETS_DISABLE_GUARDS_TOKEN,
} from './rockets-core.constants';
export { AuthServerGuard } from './infrastructure/guards/auth-server.guard';

// Decorators
export { AuthPublic } from './decorators/auth-public.decorator';

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
export { getActor } from './utils/get-actor.helper';

// Reusable repository hooks
export {
  OwnerScopeHook,
  DEFAULT_OWNER_COLUMN,
} from './infrastructure/hooks/owner-scope.hook';
export { OwnerStampHook } from './infrastructure/hooks/owner-stamp.hook';

// Exceptions filter
export {
  RocketsCoreExceptionsFilter,
  ERROR_MESSAGE_FALLBACK,
} from './infrastructure/filters/exceptions.filter';

// Repository persistence interfaces
export type { RepositoryPersistenceConfig } from './domain/interfaces/repository-persistence.interface';
export type {
  RocketsRepositoriesConfig,
  RepositoryRegisterEntry,
} from './domain/interfaces/rockets-repositories.interface';
export { flattenRepositories } from './infrastructure/utils/flatten-repositories';

// Resource config & definition API
export type { RocketsResourceConfig } from './domain/interfaces/rockets-resource.interface';
export { defineResource } from './infrastructure/resource/define-resource';
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
  prepareResourceRegistration,
  isGeneratedResourceDefinition,
} from './infrastructure/resource/aggregate-resources';
export type {
  ResourceRegistrationPlan,
  ResourceDefinitionInput,
} from './infrastructure/resource/aggregate-resources';
export type {
  RocketsResourceDefinition,
  ResourceDtoConfig,
  ResourceRelationEntry,
  ResourcePersistenceConfig as ResourcePersistenceConfigDefinition,
  ResourceHandlerOverrides,
  ResourceOperationName,
  ResourceOperationOverride,
  ResourceOverrides,
  ResourceControllerOverrides,
  EntityConstructor,
} from './domain/interfaces/rockets-resource-definition.interface';
export type { RocketsResourceBundle } from './domain/interfaces/rockets-resource-bundle.interface';

// Swagger (re-exported so consumers don't need @bitwild/rockets-common directly)
export type { SwaggerUiOptionsInterface } from '@bitwild/rockets-common';

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

// Constants
export {
  USER_METADATA_MODULE_ENTITY_KEY,
  USER_MODULE_USER_ENTITY_KEY,
  ROCKETS_CORE_SETTINGS_TOKEN,
} from './rockets-core.constants';
