// Zod-first resource layer for Rockets. Database-agnostic: it produces
// what core already accepts (nestjs-zod DTO classes + defineResource()),
// and delegates entity generation to a SchemaEntityCompiler adapter
// (e.g. @bitwild/rockets-repository-typeorm). Nothing here imports an ORM.
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
export { compileDtoClass, namedZodDto } from './zod-dto';
export { f } from './fields';
export {
  WireRow,
  PersistenceRow,
  SchemaPersistenceRow,
} from './persistence-row';
export { createdEntity, baseEntity, auditableEntity } from './base-entity';
export { zodResource, zodSubResource, bindZodResources } from './zod-resource';
export { zodModuleResource } from './zod-module-resource';
export { defineZodUserMetadata } from './zod-user-metadata';
export type {
  ZodResourceDefinition,
  ZodSubResourceDefinition,
  ZodResourceDtos,
  ZodResourceManifest,
} from './zod-resource-contracts';
export type {
  ZodCrudOperation,
  ZodOperationConfig,
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
