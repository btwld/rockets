export * from '@concepta/nestjs-crud';

/** Base CQRS handler classes (used by custom resource handlers; not on upstream barrel). */
export { CrudQueryHandler } from '@concepta/nestjs-crud/dist/application/queries/handlers/crud-query.handler';
export { CrudCommandHandler } from '@concepta/nestjs-crud/dist/application/commands/handlers/crud-command.handler';
export { CrudWithBodyCommandHandler } from '@concepta/nestjs-crud/dist/application/commands/handlers/crud-with-body-command.handler';
