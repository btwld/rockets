import { z } from 'zod';
import { auditableEntity, f } from '@bitwild/rockets-core/zod';
import { zodEntityCompiler } from '../../zod-bindings';
import { tagSchema } from '../tag/tag.schema';
import { PetTagEntity, petTagSchema } from './pet-tag.schema';
import type { PetTagRow } from './pet-tag.schema';
import { PetVaccinationEntity } from '../pet-vaccination/pet-vaccination.schema';

export enum PetStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

/**
 * Zod source of truth for the pet resource (replaces the handwritten
 * `pet.entity.ts` + `pet.dto.ts`). Every column, constraint, DTO
 * projection and relation of the old pair maps to schema + meta:
 *
 * | concern                          | mapping                                     |
 * |----------------------------------|---------------------------------------------|
 * | varchar lengths                  | `z.string().max(n)` → `varchar(n)`           |
 * | `text` column (`description`)    | `db.column: { type: 'text' }`                |
 * | int range (`age` 0–50)           | `z.int().min(0).max(50)` → int + docs        |
 * | enum + column default (`status`) | `z.enum(PetStatus).default(...)`             |
 * | nullable UNIQUE (`uniqueRef`)    | `.nullable().optional()` + `db.unique`       |
 * | server-stamped `userId`          | `dto: { create: false, update: false }`      |
 * | immutable-on-PATCH `uniqueRef`   | `dto: { update: false }`                     |
 * | soft delete (`dateDeleted`)      | `db.deletedAt` → `@DeleteDateColumn`         |
 * | optimistic `version`             | `z.int().default(1)`, response-only          |
 * | `vaccinations` (classic entity)  | `hasMany` + `shape` (zod mirror for docs)    |
 * | `petTags` junction rows          | `hasMany` (eager, not exposed)               |
 * | flat `tags` array                | `compute` over the eager `petTags` rows      |
 */
export const vaccinationResponseShape = z.object({
  id: z.uuid(),
  name: z.string().meta({ example: 'Rabies' }),
  dateAdministered: z.string().meta({ example: '2024-01-15' }),
  dateExpires: z.string().meta({ example: '2025-01-15' }).optional(),
  petId: z.uuid(),
});

export const petSchema = auditableEntity({
  /**
   * Optional external reference, globally unique when set (SQLite allows
   * multiple NULLs on a UNIQUE column). Checked in `PetUniqueRefHook`
   * before insert; the column still enforces uniqueness at persistence
   * time. Create-only — PATCH may not move it.
   */
  uniqueRef: f
    .string({ max: 64, unique: true, dto: { update: false } })
    .nullable()
    .optional(),
  name: f.string({ min: 1, max: 255, example: 'Buddy' }),
  species: f.string({ min: 1, max: 100, example: 'dog' }),
  breed: f.string({ max: 255, example: 'Labrador' }).optional(),
  age: f.int({ min: 0, max: 50 }),
  color: f.string({ max: 100, example: 'golden' }).optional(),
  description: f.string({ text: true }).optional(),
  status: f.enum(PetStatus, { default: PetStatus.ACTIVE, length: 20 }),
  /**
   * Owner column — also declared as the resource's owner via
   * `owner: 'userId'` in pet.resource.ts (the two dedupe). The zod layer
   * excludes it from create/update DTOs and auto-wires an `OwnerStampHook`
   * (stamped from the actor, client values rejected).
   */
  userId: f.owner(),
  /**
   * Eager join rows from the classic `PetVaccinationEntity`. The entity
   * gains the `@OneToMany`; the response projects the explicit zod
   * mirror (`shape`) since a classic entity has no schema of its own.
   */
  vaccinations: f.hasMany(vaccinationResponseShape, {
    target: (): unknown => PetVaccinationEntity,
    shape: (): unknown => vaccinationResponseShape,
    mappedBy: 'petId',
    expose: true,
    eager: true,
    include: 'default',
  }),
  /**
   * Eager-loaded junction rows. Not exposed — the flat `tags` computed
   * field below is the public projection. Mutations go through the
   * dedicated sub-resource (`/pets/:petId/tags`), never the parent
   * payload.
   */
  petTags: f.hasMany(petTagSchema, {
    target: (): unknown => PetTagEntity,
    mappedBy: 'petId',
    eager: true,
    include: 'default',
  }),
  /**
   * Flat tag projection derived from the eager-loaded `petTags`
   * collection. Kept for response-shape compatibility with clients that
   * consumed the previous M:N `@JoinTable` mapping.
   */
  tags: f
    .compute(z.array(tagSchema), (row) => {
      const petTags = Array.isArray(row.petTags)
        ? (row.petTags as PetTagRow[])
        : [];
      return petTags
        .map((pt) => pt.tag)
        .filter((t): t is NonNullable<typeof t> => Boolean(t));
    })
    .optional(),
});

/** Wire row type — use this for static typing, never the entity class. */
export type Pet = z.infer<typeof petSchema>;

/**
 * Generated entity class (named `PetEntity`, table `pets`). Referenced
 * by hooks (`OwnerStampHook.for`, `@EntityHook`), services and handlers
 * (`@InjectDynamicRepository`), the vaccination/junction inverse sides,
 * and admin — exactly like the old handwritten class.
 */
export const PetEntity = zodEntityCompiler.compileEntity(petSchema, {
  name: 'PetEntity',
  table: 'pets',
});
