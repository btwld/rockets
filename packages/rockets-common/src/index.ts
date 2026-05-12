// ── Hooks (full re-export from @concepta/nestjs-hook) ──
export {
  // Module
  HookModule,
  // Services
  HookResolverService,
  // Decorators
  Hook,
  UseHooks,
  Specification,
  createHookMethodDecorator,
  // Specifications
  Spec,
  CompositeSpecification,
  AlwaysSpecification,
  NeverSpecification,
  AndSpecification,
  OrSpecification,
  NotSpecification,
} from '@concepta/nestjs-hook';
export type {
  HookTypeInterface,
  HookMethodMetadataInterface,
  HookMethodKeyType,
} from '@concepta/nestjs-hook';

// ── Common (re-export from @concepta/nestjs-common) ──
export {
  // Settings provider
  createSettingsProvider,

  // Exceptions
  RuntimeException,
  NotAnErrorException,
  OverlayNotDefinedException,
  ModelQueryException,
  ModelMutateException,
  ModelValidationException,
  ModelIdNoMatchException,

  // DTOs
  AuditDto,
  CommonEntityDto,
  ReferenceIdDto,

  // Utilities
  mapNonErrorToException,
  mapHttpStatus,
  toMilliseconds,

  // Context
  AppContextHost,
  getAppContext,
  Ctx,
  OverlayRef,
  ContextOverlayInterceptor,
  RefsToMethods,

  // Events
  EventContextHost,

  // Enums
  ActionEnum,
  Operation,
  ReadOperations,
  WriteOperations,
  MutateOperations,

  // Domain factory
  DomainFactory,
} from '@concepta/nestjs-common';

// Decorator (relocated from @concepta/nestjs-common to @concepta/nestjs-authentication in v8)
export { AuthUser } from '@concepta/nestjs-authentication';

export type {
  // Module interfaces
  ModuleOptionsControllerInterface,
  ModuleOptionsSettingsInterface,

  // Exception interfaces
  RuntimeExceptionInterface,
  RuntimeExceptionOptions,
  ExceptionContext,
  ExceptionInterface,

  // Reference types
  ReferenceId,
  ReferenceEmail,
  ReferenceSubject,
  ReferenceUsername,
  ReferenceActive,
  ReferenceAssignment,

  // Reference interfaces
  ReferenceIdInterface,
  ReferenceEmailInterface,
  ReferenceSubjectInterface,
  ReferenceUsernameInterface,
  ReferenceActiveInterface,
  ReferenceAssigneeInterface,
  ReferenceAssignmentInterface,
  ReferenceUserInterface,
  ReferenceRoleInterface,
  ReferenceRolesInterface,
  ReferenceVersionInterface,

  // Audit types
  AuditDateCreated,
  AuditDateDeleted,
  AuditDateUpdated,
  AuditVersion,

  // Audit interfaces
  AuditInterface,
  AuditDateCreatedInterface,
  AuditDateDeletedInterface,
  AuditDateUpdatedInterface,
  AuditVersionInterface,

  // Model query interfaces
  ByEmailInterface,
  ByIdInterface,
  BySubjectInterface,
  ByUsernameInterface,

  // Model mutate interfaces
  CreateOneInterface,
  RemoveOneInterface,
  ReplaceOneInterface,
  UpdateOneInterface,

  // Utility types
  LiteralObject,
  DeepPartial,

  // Context types
  AppContextInterface,
  HookContextInterface,

  // Event types
  EventContextInterface,

  // Hook interfaces
  SpecificationInterface,
  HookOption,
  HookWithSpec,
} from '@concepta/nestjs-common';

// ── Swagger UI ──
export { SwaggerUiModule, SwaggerUiService } from '@concepta/nestjs-swagger-ui';
export type { SwaggerUiOptionsInterface } from '@concepta/nestjs-swagger-ui';

// ── Shared Utilities ──
export {
  logAndGetErrorDetails,
  getErrorDetails,
} from './utils/error-logging.helper';
export type { ErrorDetails } from './utils/error-logging.helper';
export {
  createRepositoryContext,
  RepositoryContextInterface,
} from './utils/repository-context.helper';
export { stripUndefined } from './utils/strip-undefined.helper';
export { whitelistedFromDto } from './utils/whitelisted-from-dto.util';
export { deriveEntityKey } from './utils/derive-entity-key.util';
export { resolveEntityKey } from './utils/resolve-entity-key.util';
