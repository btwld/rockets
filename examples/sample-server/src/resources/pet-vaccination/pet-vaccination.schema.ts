import { z } from 'zod';
import { f, rocketsFieldMeta } from '@concepta/rockets-core/zod';
import { zodEntityCompiler, zodResource } from '../../zod-bindings';
import { PetEntity } from '../pet/pet.schema';

/**
 * Zod source of truth for the pet vaccination resource (replaces the
 * handwritten `pet-vaccination.entity.ts` + `pet-vaccination.dto.ts` +
 * `pet-vaccination.resource.ts`).
 *
 * `petId` is the FK to the (zod) `PetEntity` — declared via `f.fk` against
 * the compiled entity CLASS (not `petSchema`) because pet ↔ vaccination
 * reference each other; the explicitly-typed class breaks the inference
 * cycle. `dateCreated` / `dateUpdated` are columns but excluded from the
 * response projection (`dto.response: false`) to match the old DTO, which
 * exposed only id/name/dates/petId.
 */
export const petVaccinationSchema = z.object({
  id: f.pk(),
  name: f.string({ min: 1, max: 255, example: 'Rabies' }),
  dateAdministered: f.string({ example: '2024-01-15', column: { type: 'date' } }),
  dateExpires: f
    .string({ example: '2025-01-15', column: { type: 'date' } })
    .nullable()
    .optional(),
  petId: f.fk(() => PetEntity, { onDelete: 'CASCADE', include: 'default' }),
  // Not `f.createdAt()`: a second `.register` on the same instance would
  // replace its `db` meta, so both roles are declared in one call.
  dateCreated: z.date().register(rocketsFieldMeta, {
    db: { createdAt: true },
    dto: { response: false },
  }),
  dateUpdated: z.date().register(rocketsFieldMeta, {
    db: { updatedAt: true },
    dto: { response: false },
  }),
});

export type PetVaccination = z.infer<typeof petVaccinationSchema>;

export const PetVaccinationEntity = zodEntityCompiler.compileEntity(
  petVaccinationSchema,
  { name: 'PetVaccinationEntity', table: 'pet_vaccinations' },
);

export const petVaccinationResource = zodResource({
  name: 'PetVaccination',
  schema: petVaccinationSchema,
  table: 'pet_vaccinations',
  operations: ['list', 'read', 'create', 'delete'],
});
