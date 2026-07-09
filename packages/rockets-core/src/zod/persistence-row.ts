import { z } from 'zod';

/**
 * API / OpenAPI wire shape inferred from a zod object schema. Prefer this
 * over `z.infer` in resource code — the name signals "document contract".
 */
export type WireRow<S extends z.ZodObject> = z.output<S>;

/** ISO datetime wire values become `Date` in loaded persistence rows. */
type CoerceIsoDateTime<V> = V extends string
  ? Date
  : V extends string | null
  ? Date | null
  : V extends string | undefined
  ? Date | undefined
  : V extends string | null | undefined
  ? Date | null | undefined
  : V;

/** Field names that the TypeORM compiler maps to datetime columns. */
type PersistenceDateTimeKey =
  | 'dateCreated'
  | 'dateUpdated'
  | 'dateDeleted'
  | 'sendAt';

type TransformPersistenceValue<T> = T extends readonly (infer U)[]
  ? PersistenceRow<U>[]
  : T extends Record<string, unknown>
  ? PersistenceRow<T>
  : T;

/**
 * In-memory row shape after loading from persistence (TypeORM entity
 * instances / plain rows). ISO datetime strings from {@link WireRow}
 * become `Date`; nested objects and relation arrays recurse.
 *
 * Use in hooks, handlers and `@InjectDynamicRepository` call sites.
 * Controllers and OpenAPI stay on {@link WireRow}.
 */
export type PersistenceRow<T> = T extends Record<string, unknown>
  ? {
      [K in keyof T]: K extends PersistenceDateTimeKey
        ? CoerceIsoDateTime<T[K]>
        : TransformPersistenceValue<T[K]>;
    }
  : T;

/** {@link PersistenceRow} for a zod object schema's wire output. */
export type SchemaPersistenceRow<S extends z.ZodObject> = PersistenceRow<
  WireRow<S>
>;
