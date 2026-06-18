import { z } from 'zod';
import { f } from './fields';

/**
 * Entity presets composed from the audit field helpers in {@link f}. They
 * cover the three common profiles; soft delete and optimistic locking are
 * independent traits, so for any other combination compose a `z.object`
 * directly with `f.deletedAt()` / `f.version()` (e.g. soft delete without a
 * version counter) — the helpers ARE the decoupled building blocks.
 */

/**
 * Identity + a created timestamp only: `{ id, ...shape, dateCreated }`. For
 * append-only / log-like resources that are never updated in place.
 */
export function createdEntity<Shape extends z.ZodRawShape>(shape: Shape) {
  return z.object({
    id: f.pk(),
    ...shape,
    dateCreated: f.createdAt(),
  });
}

/**
 * Identity + created/updated timestamps:
 * `{ id, ...shape, dateCreated, dateUpdated }`. The default for mutable
 * resources without soft delete or optimistic locking.
 */
export function baseEntity<Shape extends z.ZodRawShape>(shape: Shape) {
  return z.object({
    id: f.pk(),
    ...shape,
    dateCreated: f.createdAt(),
    dateUpdated: f.updatedAt(),
  });
}

/**
 * {@link baseEntity} plus soft delete (`dateDeleted`) and an optimistic
 * lock (`version`). A preset for the common "fully audited" resource — use
 * with `delete: { soft: true }`. Need only one of the two traits? Compose
 * from `baseEntity` + the individual `f.deletedAt()` / `f.version()` field.
 */
export function auditableEntity<Shape extends z.ZodRawShape>(shape: Shape) {
  return z.object({
    id: f.pk(),
    ...shape,
    dateCreated: f.createdAt(),
    dateUpdated: f.updatedAt(),
    dateDeleted: f.deletedAt(),
    version: f.version(),
  });
}
