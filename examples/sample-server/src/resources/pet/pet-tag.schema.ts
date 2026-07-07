import { z } from 'zod';
import { f, rocketsEntityMeta } from '@bitwild/rockets-core/zod';
import { zodEntityCompiler } from '../../zod-bindings';
import { PetEntity } from './pet.schema';
import { tagSchema } from '../tag/tag.schema';
import type { Tag } from '../tag/tag.schema';

/**
 * Zod source of truth for the pet↔tag junction (replaces the
 * handwritten `pet-tag.entity.ts` + `pet-tag.dto.ts`).
 *
 * Modeled as a first-class entity (own UUID id + composite UNIQUE on
 * the pair via `rocketsEntityMeta`) instead of an implicit TypeORM
 * `@JoinTable`, so the M:N relation stays exposed as plain CRUD
 * endpoints (`/pets/:petId/tags`) — the repo idiom for many-to-many.
 *
 * Field roles:
 * - `petId` — FK to `PetEntity`; `dto.create: false` because the value
 *   comes from the URL (`PathScopeHook` stamps it), never from the body.
 *   The old `PetTagCreateDto` was `PickType(tagId)` — same contract,
 *   derived. Targets the entity CLASS, not `petSchema`: pet ↔ pet-tag
 *   reference each other, and a schema target would form a type-inference
 *   cycle (the entity class has an explicit `Type` annotation that breaks
 *   it). `tagId` can target the schema because tag has no back-reference.
 * - `tagId` — FK to the zod `tagSchema`; `expose: true` projects the
 *   tag's response shape into the junction response (the old
 *   handwritten `tag?: TagResponseDto` eager preview).
 */
export const petTagSchema = z
  .object({
    id: f.pk(),
    petId: f.fk(() => PetEntity, {
      dto: { create: false },
      onDelete: 'CASCADE',
      include: 'default',
    }),
    tagId: f.fk(() => tagSchema, {
      expose: true,
      onDelete: 'CASCADE',
      include: 'default',
    }),
    dateCreated: f.createdAt(),
  })
  .register(rocketsEntityMeta, { unique: [['petId', 'tagId']] });

/** Wire row type. Eager rows additionally carry the loaded relation. */
export type PetTag = z.infer<typeof petTagSchema>;
export type PetTagRow = PetTag & { readonly tag?: Tag };

/**
 * Generated entity class (named `PetTagEntity`, table `pet_tag`).
 * Compiled HERE — not inside `zodSubResource()` — so
 * `PetTagTagIdExistsHook` can bind via `@EntityHook` and
 * `PetEntity.petTags` can reference it without a module cycle.
 */
export const PetTagEntity = zodEntityCompiler.compileEntity(petTagSchema, {
  name: 'PetTagEntity',
  table: 'pet_tag',
});
