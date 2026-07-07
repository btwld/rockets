import type { PlainLiteralObject, Type } from '@nestjs/common';
import { z } from 'zod';
import { RocketsRelationTarget } from './field-meta';

/**
 * schema → entity-class registry. Database-agnostic: it maps a zod
 * schema to WHATEVER class the active {@link SchemaEntityCompiler}
 * produced for it (TypeORM-decorated, Firestore token, …). The zod
 * resource layer and the compiler adapters share this one registry so a
 * relation declared as a zod-schema thunk can be resolved to the entity
 * class the other resource compiled.
 *
 * Populated by `registerSchemaEntity` (called by `zodResource()` and by
 * each compiler after it builds the class); consumed by
 * `resolveRelationTarget` when a relation target is declared as a zod
 * schema instead of an entity class.
 */
const schemaEntities = new WeakMap<z.ZodObject, Type<PlainLiteralObject>>();

export function registerSchemaEntity(
  schema: z.ZodObject,
  entity: Type<PlainLiteralObject>,
): void {
  schemaEntities.set(schema, entity);
}

/**
 * The entity class already compiled for `schema`, or `undefined`. A
 * schema file that compiles its entity eagerly (to bind an `@EntityHook`
 * or an inverse `@OneToMany` without a module cycle) registers it here;
 * `zodResource` then REUSES it instead of compiling a second class for
 * the same schema. This is what lets a resource omit the redundant
 * `entity:` override — the schema is the single source.
 */
export function getRegisteredEntity(
  schema: z.ZodObject,
): Type<PlainLiteralObject> | undefined {
  return schemaEntities.get(schema);
}

/**
 * True for class constructors / functions — the only non-schema shape a
 * relation target thunk may produce.
 */
function isEntityClass(value: unknown): value is Type<PlainLiteralObject> {
  return typeof value === 'function';
}

/**
 * Resolve a relation target (schema or entity-class thunk) to the
 * entity class. Called lazily — the persistence adapter evaluates the
 * relation type thunk only when it builds its metadata, by which time
 * every `zodResource()` in the app has run and registered its entity.
 */
export function resolveRelationTarget(
  target: RocketsRelationTarget,
  path: string,
): Type<PlainLiteralObject> {
  const resolved = target();
  if (resolved instanceof z.ZodObject) {
    const entity = schemaEntities.get(resolved);
    if (entity === undefined) {
      throw new Error(
        `[rockets-zod] Relation at "${path}" targets a zod schema that ` +
          'was never compiled to an entity — pass that schema to ' +
          'zodResource() (or the entity compiler) before the datasource boots.',
      );
    }
    return entity;
  }
  if (isEntityClass(resolved)) {
    return resolved;
  }
  throw new Error(
    `[rockets-zod] Relation target at "${path}" resolved to neither a ` +
      'zod object schema nor an entity class.',
  );
}
