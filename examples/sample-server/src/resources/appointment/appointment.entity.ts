import { z } from 'zod';
import { f, rocketsFieldMeta } from '@bitwild/rockets-core/zod';
import { compileZodEntity } from '../../zod-bindings';
import { ReminderEntity } from './reminder.schema';

export enum AppointmentStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  CANCELLED = 'cancelled',
}

/**
 * Zod source of truth for the appointment entity. The resource itself
 * stays a `defineResource` (appointment.resource.ts) with handwritten
 * DTOs + a custom create handler: the create input carries a non-column
 * `reminderSendAt` and the response projects `reminders` — shapes that
 * exceed a pure CRUD projection. Only the persistence entity is
 * zod-driven.
 *
 * Compiled via `compileZodEntity` (typed return) so the generated class
 * carries the schema's row type — `OwnerScopeHook.for(AppointmentEntity)`
 * and `defineResource` need the `userId`/relation keys on the entity type.
 *
 * `reminders` is the `@OneToMany(ReminderEntity)` inverse, declared as a
 * `hasMany` relation. Targets the compiled class (not `reminderSchema`):
 * appointment ↔ reminder reference each other, and the explicitly-typed
 * class breaks the inference cycle.
 */
export const appointmentSchema = z.object({
  id: f.pk(),
  petId: f.string({ max: 255 }),
  userId: f.string({ max: 255 }),
  date: z.date(),
  status: f.enum(AppointmentStatus, {
    default: AppointmentStatus.PENDING,
    length: 20,
  }),
  notes: f.string({ text: true }).optional(),
  dateCreated: z.date().register(rocketsFieldMeta, { db: { createdAt: true } }),
  reminders: z.array(z.unknown()).register(rocketsFieldMeta, {
    relation: {
      kind: 'hasMany',
      target: () => ReminderEntity,
      mappedBy: 'appointmentId',
      eager: true,
    },
  }),
});

export const AppointmentEntity = compileZodEntity(appointmentSchema, {
  name: 'AppointmentEntity',
  table: 'appointments',
});
/** Row type — shares the name with the entity value for type-position uses. */
export type AppointmentEntity = z.output<typeof appointmentSchema>;
