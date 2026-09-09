// Auth decorators (origin: rockets-authentication)
export { AuthUser } from './auth/auth-user.decorator';

// Model interfaces (origin: nestjs-common)
export { ByIdInterface } from './model/interfaces/by-id.interface';
export { CreateOneInterface } from './model/interfaces/create-one.interface';
export { RemoveOneInterface } from './model/interfaces/remove-one.interface';
export { UpdateOneInterface } from './model/interfaces/update-one.interface';

// Shared utilities (net-new)
export {
  logAndGetErrorDetails,
  getErrorDetails,
} from './utils/error-logging.helper';
export type { ErrorDetails } from './utils/error-logging.helper';
export { stripUndefined } from './utils/strip-undefined.helper';
export { validateWithSchema } from './utils/validate-with-schema.util';
export { deriveEntityKey } from './utils/derive-entity-key.util';
export { resolveEntityKey } from './utils/resolve-entity-key.util';

// Swagger UI (origin: nestjs-swagger-ui)
export { SwaggerUiModule } from './swagger-ui/swagger-ui.module';
export { SwaggerUiService } from './swagger-ui/swagger-ui.service';
export type { SwaggerUiOptionsInterface } from './swagger-ui/interfaces/swagger-ui-options.interface';
export type { SwaggerUiSettingsInterface } from './swagger-ui/interfaces/swagger-ui-settings.interface';

// Repository extensions (net-new + extended interface)
export type {
  SchemaEntityCompiler,
  SchemaEntityCompilerOptions,
} from './repository/schema-entity-compiler.interface';
export type { RocketsRepositoryModuleInterface } from './repository/repository-module.interface';
export { InjectDynamicRepository } from './repository/inject-dynamic-repository.decorator';

// Crud extensions (entity-class adapter wrapper)
export { InjectCrudAdapter } from './crud/inject-crud-adapter.decorator';

// Crud base classes not yet exported from @concepta/nestjs-crud index
export {
  CrudCommandBaseHandler as CrudCommandHandlerBase,
  CrudQueryBaseHandler as CrudQueryHandlerBase,
} from '@concepta/nestjs-crud';
export type {
  CrudCommandInterface,
  CrudQueryInterface,
} from '@concepta/nestjs-crud';
