// Zod-first resource layer for Rockets. Database-agnostic: it produces
// what core already accepts (nestjs-zod DTO classes + defineResource()),
// and delegates entity generation to a SchemaEntityCompiler adapter
// (e.g. @bitwild/rockets-zod-typeorm). Nothing here imports an ORM.
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
export { createdEntity, baseEntity, auditableEntity } from './base-entity';
export {
  zodResource,
  zodSubResource,
  bindZodResources,
  defineZodUserMetadata,
} from './zod-resource';
export type {
  ZodCrudOperation,
  ZodOperationConfig,
  ZodDeleteOperationConfig,
  ZodRestoreOperationConfig,
  ZodResourceDefinition,
  ZodSubResourceDefinition,
  ZodResourceOperations,
  ZodResourceDtos,
  ZodResourceManifest,
  ZodUserMetadataOptions,
} from './zod-resource';
