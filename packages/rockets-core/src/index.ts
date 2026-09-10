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
export {
  parseCookies,
  extractCookie,
} from './infrastructure/auth/parse-cookies';
export {
  generateCsrfToken,
  verifyCsrfToken,
} from './infrastructure/auth/csrf-token';

// Auth tokens & guard
export {
  AUTH_ADAPTERS_TOKEN,
  CSRF_GUARD_OPTIONS_TOKEN,
} from './rockets-core.constants';
export { AuthServerGuard } from './infrastructure/guards/auth-server.guard';
// Session-cookie route policy + CSRF (issue #58). `AuthSession()` is the
// "session" leg of the ternary public | internal | session policy —
// `AuthPublic()` is "public", no decorator is "internal". `CsrfGuard`
// no-ops on every route that is not `@AuthSession()`.
export {
  AuthSession,
  ROCKETS_AUTH_SESSION_TOKEN,
  type AuthSessionMetadata,
  type AuthSessionOptions,
} from './decorators/auth-session.decorator';
export {
  CsrfGuard,
  type CsrfGuardOptions,
  // The boot-time minimum the guard enforces on `secret` — exported so
  // an app can validate its own configuration against the same number.
  MIN_CSRF_SECRET_LENGTH,
} from './infrastructure/guards/csrf.guard';

// Schema engine: the one validation-options object every Rockets route
// uses, the OpenAPI naming helpers consumer-authored schemas must go
// through, and the document converter that turns named schemas into
// `$ref`s.
export { rocketsSchemaValidation } from './common/utils/standard-schema.util';
// A hand-written response schema is not projected: a `dto: { response:
// false }` field inside it is rejected at definition time (`.omit()` it).
export { assertNoHiddenFields } from './zod/zod-projections';
export {
  assertFailClosedResponse,
  assertNamedSchema,
  buildPaginatedSchema,
  isOpenApiBridged,
  readSchemaId,
} from './common/utils/open-api-schema.util';
export { createRocketsStandardSchemaConverter } from './common/swagger-ui/rockets-standard-schema.converter';
export { SchemaValidatorConflictCheck } from './infrastructure/validation/schema-validator-conflict.check';
export { withOpenApi } from '@concepta/nestjs-core';
export { paginatedSchema, createBatchSchema } from '@concepta/nestjs-crud';
export type { CrudSchema } from '@concepta/nestjs-crud';

// Route policy audit — reports what is actually enforced on every
// discovered route, and fails the boot when the declared policy is not
// met. Opt-in via `RocketsCoreModule.forRoot({ routePolicy })`.
export {
  RouteAuditService,
  ROCKETS_ROUTE_POLICY_TOKEN,
  collectRouteAudit,
  evaluateRoutePolicy,
  formatPolicyViolations,
  type ControllerScan,
  type RouteAuditEntry,
  type RouteAuditReport,
  type RouteAuthState,
  type RoutePolicy,
  type RoutePolicyViolation,
} from './infrastructure/audit';
export { PathScopeGuard } from './infrastructure/guards/path-scope.guard';

// Decorators
export {
  AuthPublic,
  type AuthPublicMetadata,
  type AuthPublicOptions,
} from './decorators/auth-public.decorator';
// The canonical authenticated-user decorator is explicitly re-exported from
// the shared-infrastructure section below.

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
  getEntityHookBinding,
} from './infrastructure/hooks/entity-hook';
export type {
  EntityHookBinding,
  EntityHookContext,
  EntityHookLifecycleKey,
  EntityHookOptions,
  OwnedEntity,
  RocketsEntityHookForResource,
} from './infrastructure/hooks/entity-hook';
export type { RocketsCrudContext } from './domain/interfaces/rockets-crud-context.interface';

// Functional hook authoring — turns lifecycle functions into an
// `@EntityHook`-decorated, DI-ready class (sugar over PassthroughEntityHookBase).
export { defineHook } from './infrastructure/hooks/define-hook';
export type {
  EntityHookFns,
  EntityHookTools,
} from './infrastructure/hooks/define-hook';

// Reusable repository hooks
export {
  OwnerScopeHook,
  DEFAULT_OWNER_COLUMN,
} from './infrastructure/hooks/owner-scope.hook';
export {
  OwnerStampHook,
  type OwnerStampHookOptions,
} from './infrastructure/hooks/owner-stamp.hook';
export { AfterCreateReloadHook } from './infrastructure/hooks/after-create-reload.hook';
export {
  TenantScopeHook,
  type TenantIdsResolver,
  type TenantScopeOptions,
} from './infrastructure/hooks/tenant-scope.hook';
export { TenantStampHook } from './infrastructure/hooks/tenant-stamp.hook';

// Exceptions filter
export {
  RocketsCoreExceptionsFilter,
  ERROR_MESSAGE_FALLBACK,
} from './infrastructure/filters/exceptions.filter';
export {
  ROCKETS_ERROR_SERIALIZER_TOKEN,
  defaultErrorSerializer,
  detailedErrorSerializer,
} from './infrastructure/filters/error-serializer';
export {
  attachErrorDetails,
  readErrorDetails,
} from './common/utils/validation-error-details.util';
export { standardSchemaIssuesToDetails } from './common/utils/standard-schema.util';
export type {
  RocketsErrorContext,
  RocketsErrorSerializerInterface,
  RocketsErrorDetail,
} from './infrastructure/filters/error-serializer';

// Repository persistence interfaces
export type { RepositoryPersistenceConfig } from './domain/interfaces/repository-persistence.interface';
export type { RepositoryBootstrap } from './domain/interfaces/repository-bootstrap.interface';
export { isRepositoryBootstrap } from './domain/interfaces/repository-bootstrap.interface';

// Repository abstraction primitives — re-exported so downstream layers
// (`rockets`, `rockets-server-auth`) consume the persistence contract through
// core and never depend on `@concepta/rockets-repository` directly.
export type {
  RepositoryModuleInterface,
  RepositoryInterface,
} from '@concepta/nestjs-repository';
export {
  RepositoryModule,
  Where,
  getDynamicRepositoryToken,
} from '@concepta/nestjs-repository';
export {
  AppContextHost,
  getAppContext,
  type AppContextLike,
} from '@concepta/nestjs-core';

// Module resource (non-CRUD persistence + Nest module slice)
export type {
  ModuleResource,
  ModuleResourceEntityEntry,
} from './domain/interfaces/module-resource.interface';
export { ResourceKind } from './domain/interfaces/resource-kind.enum';
export type {
  OperationAclConfig,
  ResourceAclAction,
  ResourceAclConfig,
  ResourceAclPlan,
} from './domain/interfaces/resource-acl.interface';
export {
  defineModuleResource,
  isModuleResource,
} from './infrastructure/resource/define-module-resource';
export type { DefineModuleResourceInput } from './infrastructure/resource/define-module-resource';

// Operation resource (typed non-CRUD endpoints)
export type {
  OperationResource,
  OperationResourceDefinition,
  OperationContext,
  OperationRequest,
  OperationResponse,
  OperationHandler,
  OperationHandlerClassRef,
  OperationHandlerFn,
  OperationHandlerRef,
  CompiledOperationDescriptor,
  OperationHttpMethod,
} from './domain/interfaces/operation-resource.interface';
export {
  defineOperationResource,
  isOperationResource,
} from './infrastructure/resource/define-operation-resource';

// Auth bootstrap (light / external auth wiring)
export type {
  AuthBootstrap,
  AuthBootstrapContributions,
  AuthBootstrapIdentity,
} from './domain/interfaces/auth-bootstrap.interface';
export { defineAuthAdapter } from './infrastructure/auth/define-auth-adapter';
export type { DefineAuthAdapterOptions } from './infrastructure/auth/define-auth-adapter';
export {
  collectRegisteredRoutes,
  findRegisteredRouteCollisions,
  validateRegisteredRoutes,
} from './infrastructure/routing/validate-registered-routes';
export type {
  RegisteredRoute,
  RegisteredRouteCollision,
  RouteInspectionTarget,
} from './infrastructure/routing/validate-registered-routes';

// Resource config & definition API
export type { RocketsResourceConfig } from './domain/interfaces/rockets-resource.interface';
export { defineResource } from './infrastructure/resource/define-resource';
export {
  defineSubResource,
  isSubResourceDefinition,
  defaultParentParam,
} from './infrastructure/resource/define-sub-resource';
export type { RocketsSubResourceInput } from './infrastructure/resource/define-sub-resource';
export { PathScopeHook } from './infrastructure/hooks/path-scope.hook';
export type { RocketsUserMetadataConfig } from './domain/interfaces/rockets-user-metadata-config.interface';
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

// Options interfaces
export type { RocketsCoreOptionsInterface } from './infrastructure/config/interfaces/rockets-core-options.interface';
export type {
  RocketsCoreOptionsExtrasInterface,
  RocketsAccessControlConfig,
} from './infrastructure/config/interfaces/rockets-core-options-extras.interface';
export { buildAccessControlImport } from './infrastructure/access-control/build-access-control-import';
export type { RocketsCoreSettingsInterface } from './infrastructure/config/interfaces/rockets-core-settings.interface';

// User entity contracts
export type {
  BaseUserEntityInterface,
  UserEntityInterface,
  UserCreatableInterface,
  UserUpdatableInterface,
  UserModelUpdatableInterface,
} from './domain/interfaces/user.interface';

// User metadata contracts
export type {
  BaseUserMetadataEntityInterface,
  UserMetadataEntityInterface,
  UserMetadataCreatableInterface,
  UserMetadataUpdatableInterface,
  UserMetadataModelUpdatableInterface,
} from './domain/interfaces/user-metadata.interface';

// CQRS commands
export { UpsertUserMetadataCommand } from './application/commands/impl/upsert-user-metadata.command';
export { AbstractUpsertUserMetadataHandler } from './application/commands/handlers/abstract-upsert-user-metadata.handler';
export { UpsertUserMetadataHandler } from './application/commands/handlers/upsert-user-metadata.handler';

// CQRS queries
export { GetUserMetadataQuery } from './application/queries/impl/get-user-metadata.query';
export { AbstractGetUserMetadataHandler } from './application/queries/handlers/abstract-get-user-metadata.handler';
export { GetUserMetadataHandler } from './application/queries/handlers/get-user-metadata.handler';
// Shared infrastructure (formerly @concepta/rockets-common). Keep this list
// explicit so every new root-level compatibility commitment is reviewed.
export {
  AuthUser,
  ByIdInterface,
  CreateOneInterface,
  CrudCommandHandlerBase,
  CrudQueryHandlerBase,
  getErrorDetails,
  InjectCrudAdapter,
  InjectDynamicRepository,
  logAndGetErrorDetails,
  RemoveOneInterface,
  SwaggerUiModule,
  SwaggerUiService,
  UpdateOneInterface,
  deriveEntityKey,
  resolveEntityKey,
  stripUndefined,
  validateWithSchema,
} from './common';
export type {
  CrudCommandInterface,
  CrudQueryInterface,
  ErrorDetails,
  RocketsRepositoryModuleInterface,
  SchemaEntityCompiler,
  SchemaEntityCompilerOptions,
  SwaggerUiOptionsInterface,
  SwaggerUiSettingsInterface,
} from './common';

// Constants
export {
  USER_METADATA_MANAGED_FIELDS,
  USER_METADATA_MODULE_ENTITY_KEY,
  USER_MODULE_USER_ENTITY_KEY,
  ROCKETS_CORE_SETTINGS_TOKEN,
} from './rockets-core.constants';

// Rate limiting — policy → route port (issue #56)
export {
  RateLimit,
  ROCKETS_RATE_LIMIT_TOKEN,
  RATE_LIMIT_DEFAULTS_TOKEN,
  DEFAULT_RATE_LIMIT_DIMENSION,
  type RateLimitDimensionOverride,
  type RateLimitOptions,
  type RateLimitPolicy,
  type RateLimitDefaults,
} from './decorators/rate-limit.decorator';
export {
  RATE_LIMIT_STORE_TOKEN,
  type RateLimitResult,
  type RateLimitStoreInterface,
} from './domain/interfaces/rate-limit.interface';
export { RateLimitGuard } from './infrastructure/guards/rate-limit.guard';
export {
  InMemoryRateLimitStore,
  RATE_LIMIT_MAX_KEYS_TOKEN,
} from './infrastructure/rate-limit/in-memory-rate-limit-store.service';

// Job dispatch port — dedupe, lease, at-least-once (issue #53)
export {
  JOB_DISPATCH_SERVICE_TOKEN,
  type ClaimedJob,
  type EnqueueResult,
  type JobDispatchOptions,
  type JobDispatchServiceInterface,
  type JobFailOptions,
} from './domain/interfaces/job-dispatch.interface';
export { InProcessJobDispatchService } from './infrastructure/jobs/in-process-job-dispatch.service';

// Idempotency keys + webhook signature verification (issue #59)
export {
  IDEMPOTENCY_STORE_TOKEN,
  type IdempotencyStoreInterface,
  type StoredIdempotentResponse,
} from './domain/interfaces/idempotency.interface';
export { InMemoryIdempotencyStore } from './infrastructure/idempotency/in-memory-idempotency-store.service';
export { hashIdempotentRequest } from './infrastructure/idempotency/hash-idempotent-request';
export {
  createWebhookSignatureVerifier,
  verifyWebhookSignature,
  type VerifyWebhookSignatureOptions,
  type WebhookSignatureVerifier,
  type WebhookSignatureVerifierOptions,
} from './infrastructure/webhooks/verify-webhook-signature';
