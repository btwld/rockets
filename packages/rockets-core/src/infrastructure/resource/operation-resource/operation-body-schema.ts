import { z } from 'zod';

/**
 * Whether a value is a plain JSON object.
 *
 * Prototype-checked rather than `typeof value === 'object'`. A `Buffer`
 * from a raw body parser is an object and is not an array, so the looser
 * test would let it through to be stripped down to `{}` — the same silent
 * substitution the array case is rejected for. `Date`, `Map` and class
 * instances fall out for the same reason; none of them survive a JSON
 * round trip, so nothing a JSON client can send is lost.
 */
function isPlainRecord(value: unknown): value is object {
  if (value === null || typeof value !== 'object') return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function describePayload(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  if (typeof value === 'object') {
    const name: unknown = value.constructor?.name;
    return typeof name === 'string' ? `a ${name}` : 'a non-plain object';
  }
  return `a ${typeof value}`;
}

/**
 * The request-body schema of an operation, with the payload-shape guard
 * in front of the author's schema.
 *
 * A MISSING body becomes `{}`: `POST` with no payload against an
 * all-optional schema is legal, and a schema with required fields still
 * fails one step later with the field-level message rather than a
 * generic shape error. A non-record payload is REJECTED rather than
 * coerced — coercing it to `{}` made `POST []` against
 * `z.object({ note: z.string().optional() })` answer 200 with an empty
 * input. The issue is addressed at the root (empty path), so the 400's
 * `details` name the whole body.
 *
 * A `z.preprocess` keeps the guard INSIDE the schema, so the same
 * per-route Standard Schema pipe every other Rockets route runs applies
 * it, and the JSON Schema bridge still documents the author's object
 * (zod documents a preprocess pipe by its output side).
 */
export function operationBodySchema<T extends z.ZodObject>(
  schema: T,
): z.ZodPreprocess<T> {
  return z.preprocess((value, ctx) => {
    if (value === undefined) return {};
    if (!isPlainRecord(value)) {
      ctx.addIssue({
        code: 'custom',
        message: `Expected a JSON object body, received ${describePayload(
          value,
        )}`,
        path: [],
      });
      return z.NEVER;
    }
    return value;
  }, schema);
}
