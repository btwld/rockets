import type { PlainLiteralObject } from '@nestjs/common';
import { defineResource, defineSubResource } from '../index';
import type {
  CrudResource,
  RocketsSubResourceDefinition,
  RocketsUserMetadataConfig,
  SchemaEntityCompiler,
} from '../index';
import { compileZodCore } from './compile-zod-resource-core';
import { zodModuleResource } from './zod-module-resource';
import { applyOwnerStamp, mergeRelations } from './zod-resource-composition';
import type {
  ZodResourceDefinition,
  ZodResourceManifest,
  ZodSubResourceDefinition,
} from './zod-resource-contracts';
import {
  defineZodUserMetadata,
  type ZodUserMetadataOptions,
} from './zod-user-metadata';

export type {
  ZodResourceDefinition,
  ZodResourceDtos,
  ZodResourceManifest,
  ZodSubResourceDefinition,
} from './zod-resource-contracts';

/**
 * Compiles a zod schema-backed CRUD resource into the same shape core
 * already accepts from `defineResource()`.
 */
export function zodResource(
  definition: ZodResourceDefinition,
): CrudResource<PlainLiteralObject> & { readonly zod: ZodResourceManifest } {
  const {
    name,
    schema,
    operations,
    table,
    entity: entityOverride,
    entityCompiler,
    owner,
    ownerStamp,
    ...passthrough
  } = definition;

  const core = compileZodCore({
    name,
    schema,
    table,
    entity: entityOverride,
    entityCompiler,
    operations,
    owner,
    repository: passthrough.repository,
  });

  const resource = defineResource<PlainLiteralObject>({
    ...passthrough,
    entity: core.entity,
    operations: core.operations,
    relations: mergeRelations(passthrough.relations, core.relations),
    hooks: applyOwnerStamp(
      core.entity,
      core.ownerColumns,
      passthrough.hooks,
      ownerStamp,
      owner,
    ),
  });

  return Object.assign(resource, {
    zod: {
      definition,
      dtos: core.dtos,
      entity: core.entity,
    },
  });
}

export function zodSubResource(
  definition: ZodSubResourceDefinition,
): RocketsSubResourceDefinition & { readonly zod: ZodResourceManifest } {
  const {
    name,
    schema,
    operations,
    table,
    entity: entityOverride,
    entityCompiler,
    ownerStamp,
    ...passthrough
  } = definition;

  const core = compileZodCore({
    name,
    schema,
    table,
    entity: entityOverride,
    entityCompiler,
    operations,
    repository: passthrough.repository,
  });

  const sub = defineSubResource({
    ...passthrough,
    entity: core.entity,
    operations: core.operations,
    relations: mergeRelations(passthrough.relations, core.relations),
    hooks: applyOwnerStamp(
      core.entity,
      core.ownerColumns,
      passthrough.hooks,
      ownerStamp,
      undefined,
    ),
  });

  return Object.assign(sub, {
    zod: {
      definition,
      dtos: core.dtos,
      entity: core.entity,
    },
  });
}

/**
 * Bound zod resource factory set carrying the app's default
 * {@link SchemaEntityCompiler}. Per-resource `entityCompiler` or
 * `repository.entityCompiler` still wins for multi-store apps.
 */
export function bindZodResources(defaultCompiler: SchemaEntityCompiler): {
  zodResource: typeof zodResource;
  zodSubResource: typeof zodSubResource;
  zodModuleResource: typeof zodModuleResource;
  defineUserMetadata: (
    schema: Parameters<typeof defineZodUserMetadata>[0],
    options?: Omit<ZodUserMetadataOptions, 'entityCompiler'>,
  ) => RocketsUserMetadataConfig;
} {
  return {
    zodResource: (definition) =>
      zodResource({
        ...definition,
        entityCompiler: definition.entityCompiler ?? defaultCompiler,
      }),
    zodSubResource: (definition) =>
      zodSubResource({
        ...definition,
        entityCompiler: definition.entityCompiler ?? defaultCompiler,
      }),
    zodModuleResource: (definition) =>
      zodModuleResource({
        ...definition,
        entityCompiler: definition.entityCompiler ?? defaultCompiler,
      }),
    defineUserMetadata: (schema, options) =>
      defineZodUserMetadata(schema, {
        ...options,
        entityCompiler: defaultCompiler,
      }),
  };
}
