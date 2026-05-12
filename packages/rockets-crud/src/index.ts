export * from '@concepta/nestjs-crud';

/*
 * TODO(upstream: @concepta/nestjs-crud) — the following symbols are needed by
 * custom resource handlers and `defineResource()` overrides, but are not
 * re-exported from the upstream barrel (`@concepta/nestjs-crud`). Upstream
 * currently only exposes the *decorators* `CrudCommandHandler` /
 * `CrudQueryHandler` at the public index — the base handler *classes* (same
 * names, different types) and the config shapes live under `/dist/`.
 *
 * When upstream promotes these to the public barrel (ideally renaming the
 * decorator exports to avoid the class/decorator name collision), delete the
 * deep `/dist/` imports below and rely on `export * from '@concepta/nestjs-crud'`
 * alone.
 *
 * Tracking surface:
 *   - CrudQueryHandler           (class; collides with public decorator name)
 *   - CrudCommandHandler         (class; collides with public decorator name)
 *   - CrudWithBodyCommandHandler (class)
 *   - CrudRequestConfig          (type)
 *   - CrudResponseConfig         (type)
 */

/** Base CQRS handler classes (used by custom resource handlers; not on upstream barrel). */
export { CrudQueryHandler } from '@concepta/nestjs-crud/dist/application/queries/handlers/crud-query.handler';
export { CrudCommandHandler } from '@concepta/nestjs-crud/dist/application/commands/handlers/crud-command.handler';
export { CrudWithBodyCommandHandler } from '@concepta/nestjs-crud/dist/application/commands/handlers/crud-with-body-command.handler';
export { CrudMetaview } from '@concepta/nestjs-crud/dist/infrastructure/services/crud-metaview.service';

/** Request/response config shapes consumed by `defineResource` overrides (not on upstream barrel). */
export type { CrudRequestConfig } from '@concepta/nestjs-crud/dist/infrastructure/request/interfaces/crud-request-config.interface';
export type { CrudResponseConfig } from '@concepta/nestjs-crud/dist/infrastructure/request/interfaces/crud-response-config.interface';
export type { CrudParamOptionInterface } from '@concepta/nestjs-crud/dist/infrastructure/interfaces/crud-param-option.interface';
export type { CrudParamsOptionsInterface } from '@concepta/nestjs-crud/dist/infrastructure/interfaces/crud-params-options.interface';

/**
 * Shadow upstream `InjectCrudAdapter` with a class-aware variant.
 * String form remains identical to upstream; class form derives the key
 * via `deriveEntityKey()`.
 */
export { InjectCrudAdapter } from './decorators/inject-crud-adapter.decorator';
