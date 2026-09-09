import { withOpenApi } from '@concepta/rockets-core';
import { z } from 'zod';
import { PetStatus } from './pet.interface';
import { petVaccinationResponseSchema } from '../pet-vaccination/pet-vaccination.schemas';
import { petAppointmentResponseSchema } from '../pet-appointment/pet-appointment.schemas';

/**
 * Request/response schemas for the `/pets` resource — the API projection
 * of the hand-written `PetEntity`.
 *
 * The response embeds the vaccination and appointment resources' own named
 * response schemas, so the nested rows document as `$ref`s to the single
 * `PetVaccinationDto` / `PetAppointmentDto` components their routes emit.
 * `userId` is accepted on create for API-shape parity, but
 * `PetCreateHandler` always pins it to the authenticated actor; it is not
 * updatable. `withOpenApi` is the LAST call on purpose.
 */
const name = z
  .string()
  .min(1, 'Pet name must be at least 1 character')
  .max(255, 'Pet name cannot exceed 255 characters')
  .meta({ description: 'Pet name', example: 'Buddy' });
const species = z
  .string()
  .min(1)
  .max(100, 'Species cannot exceed 100 characters')
  .meta({ description: 'Pet species', example: 'dog' });
const breed = z
  .string()
  .max(255, 'Breed cannot exceed 255 characters')
  .meta({ description: 'Pet breed', example: 'Golden Retriever' });
const age = z
  .int()
  .min(0, 'Age must be at least 0')
  .max(50, 'Age cannot exceed 50 years')
  .meta({ description: 'Pet age in years', example: 3 });
const color = z
  .string()
  .max(100, 'Color cannot exceed 100 characters')
  .meta({ description: 'Pet color', example: 'golden' });
const description = z.string().meta({
  description: 'Pet description',
  example: 'A friendly and energetic dog',
});
const status = z
  .enum(PetStatus)
  .meta({ description: 'Pet status', example: PetStatus.ACTIVE });

export const petResponseSchema = withOpenApi(
  z.object({
    id: z
      .string()
      .meta({ description: 'Pet unique identifier', example: 'pet-123' }),
    name,
    species,
    breed: breed.nullish(),
    age,
    color: color.nullish(),
    description: description.nullish(),
    status,
    userId: z
      .string()
      .meta({ description: 'User ID who owns this pet', example: 'user-123' }),
    dateCreated: z.date().meta({ description: 'Creation date' }),
    dateUpdated: z.date().meta({ description: 'Update date' }),
    dateDeleted: z.date().nullish().meta({ description: 'Deletion date' }),
    version: z.int().meta({ description: 'Version number', example: 1 }),
    vaccinations: z
      .array(petVaccinationResponseSchema)
      .optional()
      .meta({ description: 'Pet vaccinations' }),
    appointments: z
      .array(petAppointmentResponseSchema)
      .optional()
      .meta({ description: 'Pet appointments' }),
  }),
  'PetResponseDto',
);

export const petCreateSchema = withOpenApi(
  z.object({
    name,
    species,
    age,
    breed: breed.optional(),
    color: color.optional(),
    description: description.optional(),
    status,
    userId: z.string().min(1).meta({
      description: 'Owner user id (PetCreateHandler pins it to the caller)',
    }),
  }),
  'PetCreateDto',
);

export const petUpdateSchema = withOpenApi(
  z.object({
    id: z.string().min(1).meta({ description: 'Pet ID', example: 'pet-123' }),
    name: name.optional(),
    species: species.optional(),
    breed: breed.optional(),
    age: age.optional(),
    color: color.optional(),
    description: description.optional(),
    status: status.optional(),
  }),
  'PetUpdateDto',
);

export type PetResponse = z.output<typeof petResponseSchema>;
export type PetCreate = z.output<typeof petCreateSchema>;
export type PetUpdate = z.output<typeof petUpdateSchema>;
