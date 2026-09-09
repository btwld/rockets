import { withOpenApi } from '@concepta/nestjs-core';
import { z } from 'zod';
import { assertFailClosedResponse } from '../common/utils/open-api-schema.util';
import type { ComputeFn, SchemaProjections } from './zod-projections';

/**
 * The single-item response schema of a resource: the projected shape,
 * with computed fields applied through a `z.preprocess` that sees the RAW
 * row (eager relations included) before the object schema strips
 * undeclared keys. Named `${Name}ResponseDto` so the OpenAPI component
 * keeps the name hand-written DTOs had.
 *
 * Serialization IS validation here: upstream runs the row through
 * `~standard.validate`, so a computed value that does not match its
 * declared schema is a loud 500, not a silently coerced payload.
 */
export function buildResponseSchema(
  name: string,
  projections: Pick<SchemaProjections, 'response' | 'compute'>,
): z.ZodType {
  const shape = z.object(projections.response);
  const computeEntries = Object.entries(projections.compute);
  const schema =
    computeEntries.length === 0
      ? shape
      : z.preprocess((row) => applyCompute(row, computeEntries), shape);
  const named = withOpenApi(schema, `${name}ResponseDto`);
  assertFailClosedResponse(named, `[zodResource] "${name}"`);
  return named;
}

function applyCompute(
  row: unknown,
  entries: ReadonlyArray<readonly [string, ComputeFn]>,
): unknown {
  if (typeof row !== 'object' || row === null) return row;
  const source = row as Readonly<Record<string, unknown>>;
  const projected: Record<string, unknown> = { ...source };
  for (const [key, compute] of entries) {
    projected[key] = compute(source);
  }
  return projected;
}
