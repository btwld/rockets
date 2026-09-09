import { withOpenApi } from '@concepta/nestjs-core';
import { z } from 'zod';
import type { RocketsUserMetadataConfig, SchemaEntityCompiler } from '../index';
import { compileZodEntity } from './compile-zod-entity';
import { projectSchema } from './zod-projections';
import { buildResponseSchema } from './zod-response-schema';
import { USER_METADATA_MANAGED_FIELDS } from '../rockets-core.constants';

/**
 * Persistence fields every userMetadata schema must declare — the zod
 * mirror of `BaseUserMetadataEntityInterface`. Presence is checked at
 * boot ({@link assertUserMetadataShape}); the update projection omits the
 * server-managed subset of these.
 */
const USER_METADATA_BASE_FIELDS = [
  'id',
  'userId',
  'dateCreated',
  'dateUpdated',
  'dateDeleted',
  'version',
] as const;

function omitKeys(
  shape: Record<string, z.ZodType>,
  keys: readonly string[],
): Record<string, z.ZodType> {
  return Object.fromEntries(
    Object.entries(shape).filter(([key]) => !keys.includes(key)),
  );
}

export interface ZodUserMetadataOptions {
  /** PascalCase base for generated names. Default `'UserMetadata'`. */
  readonly name?: string;
  /** Physical table name. Default `'userMetadata'`. */
  readonly table?: string;
  /** Compiler for the entity class (usually the bound app default). */
  readonly entityCompiler?: SchemaEntityCompiler;
  /** Per-table adapter override forwarded to the userMetadata config. */
  readonly repository?: RocketsUserMetadataConfig['repository'];
}

function assertUserMetadataShape(schema: z.ZodObject, name: string): void {
  const missing = USER_METADATA_BASE_FIELDS.filter(
    (field) => !(field in schema.shape),
  );
  if (missing.length > 0) {
    throw new Error(
      `[defineZodUserMetadata] "${name}" schema is missing required ` +
        `userMetadata field(s): ${missing.join(', ')}. A userMetadata ` +
        'schema must declare id, userId, dateCreated, dateUpdated, ' +
        'dateDeleted and version (the BaseUserMetadataEntityInterface shape).',
    );
  }
}

/**
 * `zodResource` counterpart for the `userMetadata` config slot: a single
 * zod schema compiles into the entity + the update / response schemas
 * `RocketsModule` / `RocketsCoreModule` expect — no handwritten entity or
 * DTO classes. The update schema is named `${Name}UpdateDto`, the response
 * `${Name}ResponseDto`.
 */
export function defineZodUserMetadata(
  schema: z.ZodObject,
  options: ZodUserMetadataOptions = {},
): RocketsUserMetadataConfig {
  const name = options.name ?? 'UserMetadata';
  const table = options.table ?? 'userMetadata';

  assertUserMetadataShape(schema, name);

  const entity = compileZodEntity(
    {
      name,
      schema,
      table,
      entityCompiler: options.entityCompiler,
      repository: options.repository,
    },
    'defineZodUserMetadata',
  );

  // Same projection pass `zodResource` uses, so `dto: { response: false }`
  // is honoured here exactly as on a resource — one projection path, not
  // two to keep in sync.
  const projections = projectSchema(name, schema, entity, new Set());

  const updateSchema = withOpenApi(
    z.object(omitKeys(projections.update, USER_METADATA_MANAGED_FIELDS)),
    `${name}UpdateDto`,
  );
  const responseSchema = buildResponseSchema(name, projections);

  return {
    entity,
    updateSchema,
    responseSchema,
    repository: options.repository,
  };
}
