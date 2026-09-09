import { withOpenApi } from '@concepta/rockets-core';
import { z } from 'zod';

/**
 * Request/response schemas for the `/pet-vaccinations` resource. The
 * hand-written `PetVaccinationEntity` stays the persistence source of
 * truth; these schemas are the API projection of it.
 *
 * Writable datetimes are `z.coerce.date()` so the ISO strings clients
 * send become the `Date` the columns expect; response datetimes are
 * `z.date()` (the loaded row) and serialize as ISO strings. Nullable
 * columns are `nullish` on the wire because an unset one loads as `null`.
 *
 * `withOpenApi` is the LAST call on purpose — any `.extend()` / `.pick()`
 * after it would drop the component id.
 */
const petId = z
  .string()
  .min(1)
  .meta({ description: 'Pet ID', example: 'pet-123' });
const vaccineName = z
  .string()
  .min(1)
  .max(255)
  .meta({ description: 'Vaccine name', example: 'Rabies' });
const veterinarian = z.string().min(1).max(255).meta({
  description: 'Veterinarian who administered the vaccine',
  example: 'Dr. Smith',
});
const batchNumber = z.string().max(100).meta({
  description: 'Vaccine batch number',
  example: 'BATCH-2023-001',
});
const notes = z.string().meta({ description: 'Additional notes' });

const administeredDateMeta = {
  description: 'Date vaccine was administered',
  example: '2023-01-15T10:00:00.000Z',
};
const nextDueDateMeta = {
  description: 'Next due date for this vaccine',
  example: '2024-01-15T10:00:00.000Z',
};

export const petVaccinationResponseSchema = withOpenApi(
  z.object({
    id: z.string().meta({
      description: 'Vaccination unique identifier',
      example: 'vacc-123',
    }),
    petId,
    vaccineName,
    administeredDate: z.date().meta(administeredDateMeta),
    nextDueDate: z.date().nullish().meta(nextDueDateMeta),
    veterinarian,
    batchNumber: batchNumber.nullish(),
    notes: notes.nullish(),
    dateCreated: z.date().meta({ description: 'Date created' }),
    dateUpdated: z.date().meta({ description: 'Date updated' }),
    dateDeleted: z
      .date()
      .nullish()
      .meta({ description: 'Date deleted (soft delete)' }),
    version: z
      .int()
      .meta({ description: 'Version for optimistic locking', example: 1 }),
  }),
  'PetVaccinationDto',
);

export const petVaccinationCreateSchema = withOpenApi(
  z.object({
    petId,
    vaccineName,
    administeredDate: z.coerce.date().meta(administeredDateMeta),
    nextDueDate: z.coerce.date().optional().meta(nextDueDateMeta),
    veterinarian,
    batchNumber: batchNumber.optional(),
    notes: notes.optional(),
  }),
  'PetVaccinationCreateDto',
);

export const petVaccinationUpdateSchema = withOpenApi(
  z.object({
    id: z
      .string()
      .min(1)
      .meta({ description: 'Vaccination ID', example: 'vacc-123' }),
    vaccineName: vaccineName.optional(),
    administeredDate: z.coerce.date().optional().meta(administeredDateMeta),
    nextDueDate: z.coerce.date().optional().meta(nextDueDateMeta),
    veterinarian: veterinarian.optional(),
    batchNumber: batchNumber.optional(),
    notes: notes.optional(),
  }),
  'PetVaccinationUpdateDto',
);

export type PetVaccinationResponse = z.output<
  typeof petVaccinationResponseSchema
>;
export type PetVaccinationCreate = z.output<typeof petVaccinationCreateSchema>;
export type PetVaccinationUpdate = z.output<typeof petVaccinationUpdateSchema>;
