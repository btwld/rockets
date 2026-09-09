import { withOpenApi } from '@concepta/rockets-core';
import { z } from 'zod';
import { PetAppointmentStatus } from './pet-appointment.interface';

/**
 * Request/response schemas for the `/pet-appointments` resource — the API
 * projection of the hand-written `PetAppointmentEntity`. Same conventions
 * as `pet-vaccination.schemas.ts`: coerced dates on input, `z.date()` on
 * output, `nullish` for nullable columns, `withOpenApi` last.
 */
const petId = z
  .string()
  .min(1)
  .meta({ description: 'Pet ID', example: 'pet-123' });
const appointmentType = z
  .string()
  .min(1)
  .max(100)
  .meta({ description: 'Type of appointment', example: 'checkup' });
const veterinarian = z
  .string()
  .min(1)
  .max(255)
  .meta({ description: 'Veterinarian name', example: 'Dr. Smith' });
const reason = z
  .string()
  .min(1)
  .meta({ description: 'Reason for appointment', example: 'Annual checkup' });
const notes = z.string().meta({ description: 'Additional notes' });
const diagnosis = z
  .string()
  .meta({ description: 'Diagnosis from the appointment' });
const treatment = z.string().meta({ description: 'Treatment provided' });

const appointmentDateMeta = {
  description: 'Appointment date and time',
  example: '2023-01-15T14:00:00.000Z',
};

export const petAppointmentResponseSchema = withOpenApi(
  z.object({
    id: z.string().meta({
      description: 'Appointment unique identifier',
      example: 'appt-123',
    }),
    petId,
    appointmentDate: z.date().meta(appointmentDateMeta),
    appointmentType,
    veterinarian,
    status: z.enum(PetAppointmentStatus).meta({
      description: 'Appointment status',
      example: PetAppointmentStatus.SCHEDULED,
    }),
    reason,
    notes: notes.nullish(),
    diagnosis: diagnosis.nullish(),
    treatment: treatment.nullish(),
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
  'PetAppointmentDto',
);

export const petAppointmentCreateSchema = withOpenApi(
  z.object({
    petId,
    appointmentDate: z.coerce.date().meta(appointmentDateMeta),
    appointmentType,
    veterinarian,
    reason,
    status: z.enum(PetAppointmentStatus).optional().meta({
      description: 'Appointment status',
      example: PetAppointmentStatus.SCHEDULED,
    }),
    notes: notes.optional(),
    diagnosis: diagnosis.optional(),
    treatment: treatment.optional(),
  }),
  'PetAppointmentCreateDto',
);

export const petAppointmentUpdateSchema = withOpenApi(
  z.object({
    id: z
      .string()
      .min(1)
      .meta({ description: 'Appointment ID', example: 'appt-123' }),
    appointmentDate: z.coerce.date().optional().meta(appointmentDateMeta),
    appointmentType: appointmentType.optional(),
    veterinarian: veterinarian.optional(),
    status: z.enum(PetAppointmentStatus).optional().meta({
      description: 'Appointment status',
      example: PetAppointmentStatus.COMPLETED,
    }),
    reason: reason.optional(),
    notes: notes.optional(),
    diagnosis: diagnosis.optional(),
    treatment: treatment.optional(),
  }),
  'PetAppointmentUpdateDto',
);

export type PetAppointmentResponse = z.output<
  typeof petAppointmentResponseSchema
>;
export type PetAppointmentCreate = z.output<typeof petAppointmentCreateSchema>;
export type PetAppointmentUpdate = z.output<typeof petAppointmentUpdateSchema>;
