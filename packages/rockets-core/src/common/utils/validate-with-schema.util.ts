import type { StandardSchemaV1 } from '@standard-schema/spec';
import { standardSchemaBadRequest } from './standard-schema.util';

/**
 * Validate a loose value against a Standard Schema chosen at runtime
 * (a `userMetadata` payload against the app's configured schema, for
 * example) and return the parsed value — unknown keys dropped, coercions
 * and defaults applied. Failures throw the same `400` (with `details`)
 * the route pipes produce, so a listener and a controller report
 * identically.
 */
export async function validateWithSchema<T>(
  schema: StandardSchemaV1<unknown, T>,
  data: unknown,
): Promise<T> {
  const result = await schema['~standard'].validate(data);
  if (result.issues !== undefined) {
    throw standardSchemaBadRequest(result.issues);
  }
  return result.value;
}
