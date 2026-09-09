import type { PlainLiteralObject, Type } from '@nestjs/common';
import { withOpenApi } from '@concepta/nestjs-core';
import { z } from 'zod';
import type {
  ResourceOperationsObject,
  ResourceRelationEntry,
  RocketsResourceDefinition,
  SchemaEntityCompiler,
} from '../index';
import {
  assertFailClosedResponse,
  buildPaginatedSchema,
} from '../common/utils/open-api-schema.util';
import { compileZodEntity } from './compile-zod-entity';
import {
  normalizeOperations,
  opConfig,
  type ZodCrudOperation,
  type ZodOperationSchemas,
  zodOpConfig,
  type ZodResourceOperations,
} from './zod-operations';
import { hasDeletedAtField, projectSchema } from './zod-projections';
import { buildResponseSchema } from './zod-response-schema';
import { resolveOwnerColumns } from './zod-resource-composition';
import type {
  ZodOwnerConfig,
  ZodResourceSchemas,
} from './zod-resource-contracts';

export interface ZodCoreInput {
  readonly name: string;
  readonly schema: z.ZodObject;
  readonly entity?: Type<PlainLiteralObject>;
  readonly table?: string;
  readonly operations?: readonly ZodCrudOperation[] | ZodResourceOperations;
  readonly owner?: string | ZodOwnerConfig;
  readonly entityCompiler?: SchemaEntityCompiler;
  readonly repository?: RocketsResourceDefinition<PlainLiteralObject>['repository'];
}

export interface CompiledZodCore {
  readonly entity: Type<PlainLiteralObject>;
  readonly operations: ResourceOperationsObject;
  readonly relations: ReadonlyArray<ResourceRelationEntry<PlainLiteralObject>>;
  readonly schemas: ZodResourceSchemas;
  readonly ownerColumns: string[];
}

interface OperationOutput {
  readonly resource: z.ZodType;
  readonly paginated?: z.ZodType;
}

export function compileZodCore(input: ZodCoreInput): CompiledZodCore {
  const { name, schema, entity: entityOverride } = input;
  const entity = compileZodEntity(input, 'zodResource');

  const ops = normalizeOperations(input.operations);
  const enabled = (op: ZodCrudOperation): boolean =>
    ops[op] !== undefined && ops[op] !== false;

  // Declaring an override on an operation left out of `operations` is
  // not reachable: any config object enables its operation.
  const overrides = resolveOperationOverrides(name, ops);

  const ownerColumns = resolveOwnerColumns(schema, name, input.owner);
  const projections = projectSchema(
    name,
    schema,
    entity,
    new Set(ownerColumns),
  );

  // An `input` override supplies the whole request body, so the derived
  // create projection being empty is no longer a dead end.
  const derivedBodyOps = (['create', 'replace'] as const).filter(
    (op) => enabled(op) && overrides[op]?.input === undefined,
  );
  if (
    derivedBodyOps.length > 0 &&
    Object.keys(projections.create).length === 0
  ) {
    throw new Error(
      `[zodResource] "${name}" enables create/replace but every field is ` +
        'excluded from the create projection (db-generated or ' +
        'dto.create: false) — nothing would be writable.',
    );
  }
  if (
    (enabled('update') || enabled('replace')) &&
    projections.pkKey === undefined
  ) {
    throw new Error(
      `[zodResource] "${name}" enables update/replace but no field is ` +
        'marked { db: { pk: true } }.',
    );
  }
  const deleteConfig = opConfig(ops.delete);
  if (
    'soft' in deleteConfig &&
    deleteConfig.soft === true &&
    entityOverride === undefined &&
    !hasDeletedAtField(schema)
  ) {
    throw new Error(
      `[zodResource] "${name}" enables delete: { soft: true } but no field ` +
        'is marked { db: { deletedAt: true } } — the generated entity would ' +
        'have no delete-date column and soft removal would fail at runtime.',
    );
  }

  const response = buildResponseSchema(name, projections);
  const paginated = buildPaginatedSchema(response, `[zodResource] "${name}"`);

  // One path for every request-body schema: pick the schema (override
  // wins over the derived projection), apply `strictInput` to WHICHEVER
  // won, then name it — the wrap is the LAST call, always.
  const inputSchema = (
    op: 'create' | 'update' | 'replace',
    fallback: Record<string, z.ZodType>,
    derivedName: string,
  ): z.ZodType | undefined => {
    if (!enabled(op)) return undefined;
    const override = overrides[op]?.input;
    const chosen = override ?? z.object(fallback);
    const effective =
      overrides[op]?.strictInput === true ? chosen.strict() : chosen;
    return withOpenApi(
      effective,
      override !== undefined ? `${name}${pascal(op)}InputDto` : derivedName,
    );
  };

  const create = inputSchema('create', projections.create, `${name}CreateDto`);
  const update = inputSchema('update', projections.update, `${name}UpdateDto`);
  const replace = inputSchema(
    'replace',
    projections.create,
    `${name}ReplaceDto`,
  );

  // Per-operation response override; falls back to the single projected
  // response schema the whole resource shares. A list override gets its
  // own paginated envelope, named after the override.
  const outputFor = (op: ZodCrudOperation): OperationOutput => {
    const override = overrides[op]?.output;
    if (override === undefined) {
      return { resource: response, paginated };
    }
    const context = `[zodResource] "${name}" operations.${op}.output`;
    const named = withOpenApi(override, `${name}${pascal(op)}OutputDto`);
    assertFailClosedResponse(named, context);
    return {
      resource: named,
      ...(op === 'list'
        ? { paginated: buildPaginatedSchema(named, context) }
        : {}),
    };
  };

  const list = outputFor('list');
  const operations: ResourceOperationsObject = {
    ...(enabled('list')
      ? {
          list: {
            ...zodOpConfig(ops.list),
            output: list.resource,
            paginated: list.paginated,
          },
        }
      : {}),
    ...(enabled('read')
      ? {
          read: {
            ...zodOpConfig(ops.read),
            output: outputFor('read').resource,
          },
        }
      : {}),
    ...(enabled('create') && create !== undefined
      ? {
          create: {
            ...zodOpConfig(ops.create),
            input: create,
            output: outputFor('create').resource,
          },
        }
      : {}),
    ...(enabled('update') && update !== undefined
      ? {
          update: {
            ...zodOpConfig(ops.update),
            input: update,
            output: outputFor('update').resource,
          },
        }
      : {}),
    ...(enabled('replace') && replace !== undefined
      ? {
          replace: {
            ...zodOpConfig(ops.replace),
            input: replace,
            output: outputFor('replace').resource,
          },
        }
      : {}),
    ...(enabled('delete')
      ? {
          delete: {
            ...zodOpConfig(ops.delete),
            ...(overrides.delete?.output
              ? { output: outputFor('delete').resource }
              : {}),
          },
        }
      : {}),
    ...(enabled('restore')
      ? {
          restore: {
            ...zodOpConfig(ops.restore),
            ...(overrides.restore?.output
              ? { output: outputFor('restore').resource }
              : {}),
          },
        }
      : {}),
  };

  return {
    entity,
    operations,
    relations: projections.relations,
    schemas: {
      request: { create, update, replace },
      response: { resource: response, paginated },
    },
    ownerColumns,
  };
}

/**
 * Operations that carry a request body. `input` anywhere else is a
 * mistake core would silently drop.
 */
const BODY_OPERATIONS: ReadonlySet<ZodCrudOperation> = new Set([
  'create',
  'update',
  'replace',
]);

/**
 * Reads the per-operation `input` / `output` schema overrides and fails
 * fast on the combinations core cannot honour. Silently ignoring an
 * override is exactly the failure mode this layer exists to prevent:
 * the app believes it controls the contract, the wire says otherwise,
 * and the test suite stays green.
 */
function resolveOperationOverrides(
  name: string,
  ops: ZodResourceOperations,
): Readonly<Partial<Record<ZodCrudOperation, ZodOperationSchemas>>> {
  const resolved: Partial<Record<ZodCrudOperation, ZodOperationSchemas>> = {};

  for (const op of ALL_OPERATIONS) {
    const config = opConfig(ops[op]);
    const { input, output, strictInput } = config;
    if (
      input === undefined &&
      output === undefined &&
      strictInput === undefined
    )
      continue;

    if (input !== undefined && !BODY_OPERATIONS.has(op)) {
      throw new Error(
        `[zodResource] "${name}" declares an \`input\` schema on "${op}", ` +
          'which has no request body. Only create/update/replace accept one.',
      );
    }
    // Only `true` is rejected: an explicit `strictInput: false` (e.g. a
    // computed flag) is a no-op opt-out, not a config mistake.
    if (strictInput === true && !BODY_OPERATIONS.has(op)) {
      throw new Error(
        `[zodResource] "${name}" declares \`strictInput\` on "${op}", ` +
          'which has no request body to be strict about. Only ' +
          'create/update/replace accept it.',
      );
    }
    // `returnDeleted` alone decides the status: upstream `CrudDelete`
    // sets `HttpStatus.OK` on `returnDeleted === true` regardless of
    // `soft`, and `CrudAdapter.delete` returns the deleted row
    // (`crud-delete.decorator.js`, `crud.adapter.js`). A hard delete that
    // returns its row is a valid shape.
    if (
      output !== undefined &&
      op === 'delete' &&
      !('returnDeleted' in config && config.returnDeleted === true)
    ) {
      throw new Error(
        `[zodResource] "${name}" declares an \`output\` schema on ` +
          '"delete" without `returnDeleted: true` — the route answers ' +
          '204 and the schema would never be serialized.',
      );
    }
    if (output !== undefined && op === 'restore') {
      const restoreReturns =
        'returnRestored' in config && config.returnRestored === true;
      if (!restoreReturns) {
        throw new Error(
          `[zodResource] "${name}" declares an \`output\` schema on ` +
            '"restore" without `returnRestored: true` — the route answers ' +
            '204 and the schema would never be serialized.',
        );
      }
    }

    resolved[op] = { input, output, strictInput };
  }

  return resolved;
}

const ALL_OPERATIONS: readonly ZodCrudOperation[] = [
  'list',
  'read',
  'create',
  'update',
  'replace',
  'delete',
  'restore',
];

function pascal(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
