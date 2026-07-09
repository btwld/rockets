import { z } from 'zod';
import type {
  RocketsUserMetadataConfig,
  SchemaEntityCompiler,
  UserMetadataCreatableInterface,
  UserMetadataModelUpdatableInterface,
} from '../index';
import { compileZodEntity } from './compile-zod-entity';
import { compileDtoClass, namedZodDto } from './zod-dto';

/**
 * Persistence fields every userMetadata schema must declare — the zod
 * mirror of `BaseUserMetadataEntityInterface`. Presence is checked at
 * boot ({@link assertUserMetadataShape}); the create / update DTO
 * projections omit the server-managed subset of these.
 */
const USER_METADATA_BASE_FIELDS = [
  'id',
  'userId',
  'dateCreated',
  'dateUpdated',
  'dateDeleted',
  'version',
] as const;

export interface ZodUserMetadataOptions {
  /** PascalCase base for generated class names. Default `'UserMetadata'`. */
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
 * zod schema compiles into the entity + create / update / response DTO
 * quad that `RocketsModule` / `RocketsCoreModule` expect — no handwritten
 * entity or DTO classes.
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

  const createDto = namedZodDto<UserMetadataCreatableInterface>(
    schema.omit({
      id: true,
      dateCreated: true,
      dateUpdated: true,
      dateDeleted: true,
      version: true,
    }),
    `${name}CreateDto`,
  );

  const updateDto = namedZodDto<UserMetadataModelUpdatableInterface>(
    schema
      .omit({
        id: true,
        userId: true,
        dateCreated: true,
        dateUpdated: true,
        dateDeleted: true,
        version: true,
      })
      .partial(),
    `${name}UpdateDto`,
  );

  const responseDto = compileDtoClass(schema, `${name}ResponseDto`);

  return {
    entity,
    createDto,
    updateDto,
    responseDto,
    repository: options.repository,
  };
}
