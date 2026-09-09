// Zod-first resource layer for Rockets. Database-agnostic: it produces
// what core already accepts (named zod schemas + defineResource()), and
// delegates entity generation to a SchemaEntityCompiler adapter
// (e.g. @concepta/rockets-repository-typeorm). Nothing here imports an ORM.
export {
  getRegisteredEntity,
  registerSchemaEntity,
  resolveRelationTarget,
} from './schema-registry';
export {
  rocketsFieldMeta,
  rocketsEntityMeta,
  readFieldMeta,
  readFieldMetaDeep,
  readEntityMeta,
  asClassicSchema,
  unwrapField,
  isDbGenerated,
  relationPropertyFor,
} from './field-meta';
export type {
  RocketsDbFieldMeta,
  RocketsDtoFieldMeta,
  RocketsEntityMeta,
  RocketsFieldMeta,
  RocketsRelationFieldMeta,
  RocketsRelationTarget,
  UnwrappedField,
} from './field-meta';
export { f } from './fields';
export type {
  WireRow,
  JsonEncoded,
  SchemaPersistenceRow,
} from './persistence-row';
export { buildResponseSchema } from './zod-response-schema';
export type { ComputeFn, SchemaProjections } from './zod-projections';
export { createdEntity, baseEntity, auditableEntity } from './base-entity';
export { zodResource, zodSubResource, bindZodResources } from './zod-resource';
export { zodModuleResource } from './zod-module-resource';
export {
  operationResource,
  extractPathParamNames,
} from './zod-operation-resource';
export type {
  BoundBuilders,
  DeleteBuilderConfig,
  OperationRecord,
  OperationResourceInput,
  PathParams,
  PendingOperation,
  ReadBuilderConfig,
  SseBuilderConfig,
  WriteBuilderConfig,
  ZodOperationResource,
} from './zod-operation-resource';
export { defineZodUserMetadata } from './zod-user-metadata';
export type {
  ZodResourceDefinition,
  ZodSubResourceDefinition,
  ZodResourceSchemas,
  ZodResourceManifest,
} from './zod-resource-contracts';
export type {
  ZodCrudOperation,
  ZodOperationConfig,
  ZodOperationSchemas,
  ZodDeleteOperationConfig,
  ZodRestoreOperationConfig,
  ZodResourceOperations,
} from './zod-operations';
export type {
  ZodModuleResourceEntityDefinition,
  ZodModuleResourceEntityInput,
  ZodModuleResourceInput,
} from './zod-module-resource';
export type { ZodUserMetadataOptions } from './zod-user-metadata';
