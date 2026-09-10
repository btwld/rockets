import { z } from 'zod';
import { baseEntity } from './base-entity';
import { f } from './fields';

/**
 * Type-level contract for `f.compute` callbacks. Run with
 * `yarn workspace @concepta/rockets-core test:typetests`.
 *
 * The callback must return `z.output<schema>` — the ROW shape (`Date` for
 * date columns), because the response schema validates the computed value
 * at serialization time. Undeclared keys on the returned rows are still
 * fine at the type level (structural typing) and are stripped by the
 * response schema at runtime; the value TYPES of declared keys are
 * enforced here.
 */

const tagSchema = baseEntity({
  name: f.string({ min: 1, max: 100 }),
  color: f.string({ max: 20 }).optional(),
});

interface TagRow {
  readonly id: string;
  readonly name: string;
  readonly color?: string;
  readonly dateCreated: Date;
  readonly dateUpdated: Date;
  /** A column the wire schema does not declare — stripped at runtime. */
  readonly internalCost: number;
}

declare const tagRows: TagRow[];

// ── ALLOWED ───────────────────────────────────────────────────────────
// Re-emitting ORM rows: `dateCreated` is a `Date` on the row AND in the
// schema output, and the extra `internalCost` column is a structural
// superset — the response schema strips it.
export const reemitsOrmRows = f.compute(z.array(tagSchema), () => tagRows);

// Hand-built objects that match the declared output types.
export const handBuilt = f.compute(z.array(tagSchema), () =>
  tagRows.map((tag) => ({
    id: tag.id,
    name: tag.name,
    color: tag.color,
    dateCreated: tag.dateCreated,
    dateUpdated: tag.dateUpdated,
  })),
);

// A scalar compute whose output is a Date (`f.date()` output is Date).
export const scalarDate = f.compute(f.date(), (row) =>
  row.dateCreated instanceof Date ? row.dateCreated : new Date(0),
);

// ── REJECTED ──────────────────────────────────────────────────────────
// Wrong value type on a declared key: `name` is a string in the schema.
export const wrongValueType = f.compute(z.array(tagSchema), () =>
  // @ts-expect-error — name: number is not assignable to string
  tagRows.map((tag) => ({
    id: tag.id,
    name: tag.internalCost,
    dateCreated: tag.dateCreated,
    dateUpdated: tag.dateUpdated,
  })),
);

// ISO strings are the WIRE format, not the output: a date column computed
// as a string is rejected — it would fail schema validation at runtime.
export const isoStringForDate = f.compute(z.array(tagSchema), () =>
  // @ts-expect-error — dateCreated: string is not assignable to Date
  tagRows.map((tag) => ({
    id: tag.id,
    name: tag.name,
    dateCreated: tag.dateCreated.toISOString(),
    dateUpdated: tag.dateUpdated,
  })),
);

// Reading a property that does not exist on the source row: without the
// typed return this silently produced `undefined` on the wire.
export const missingSourceProperty = f.compute(z.array(tagSchema), () =>
  tagRows.map((tag) => ({
    id: tag.id,
    name: tag.name,
    // @ts-expect-error — 'colorCode' does not exist on TagRow
    color: tag.colorCode,
    dateCreated: tag.dateCreated,
    dateUpdated: tag.dateUpdated,
  })),
);
