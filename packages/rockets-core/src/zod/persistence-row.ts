import type { z } from 'zod';

/**
 * Row shape as loaded from persistence and seen by hooks, handlers and
 * `@InjectDynamicRepository` call sites: exactly the schema's output —
 * `Date` for `f.date()` / `f.createdAt()` columns, nested objects for
 * eager relations.
 */
export type SchemaPersistenceRow<S extends z.ZodType> = z.output<S>;

/**
 * JSON encoding of a value: `Date` becomes its ISO string, recursively
 * through arrays and objects. Nothing else changes shape.
 */
export type JsonEncoded<T> = T extends Date
  ? string
  : T extends ReadonlyArray<infer U>
  ? JsonEncoded<U>[]
  : T extends object
  ? { [K in keyof T]: JsonEncoded<T[K]> }
  : T;

/**
 * API / OpenAPI wire shape of a schema: its output after JSON encoding.
 * Prefer this over `z.infer` in controller and client code — the name
 * signals "document contract", and it is what a client actually receives
 * (`dateCreated` is a string on the wire, a `Date` in the row).
 */
export type WireRow<S extends z.ZodType> = JsonEncoded<z.output<S>>;
