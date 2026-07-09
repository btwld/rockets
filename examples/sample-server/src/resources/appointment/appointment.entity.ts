import { z } from 'zod';
import { f, rocketsFieldMeta, WireRow, SchemaPersistenceRow } from '@bitwild/rockets-core/zod';
import { compileZodEntity } from '../../zod-bindings';
import { ReminderEntity } from './reminder.schema';

/** Wire-shape mirror for the eager `reminders` relation (no schema import — breaks the appointment ↔ reminder inference cycle). */
const reminderRelationElement = z.object({
  id: z.uuid(),
  appointmentId: z.uuid(),
  sendAt: z.iso.datetime(),
  sent: z.boolean(),
});

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
  reminders: f.hasMany(reminderRelationElement, {
    target: (): unknown => ReminderEntity,
    mappedBy: 'appointmentId',
    eager: true,
  }),
});

export const AppointmentEntity = compileZodEntity(appointmentSchema, {
  name: 'AppointmentEntity',
  table: 'appointments',
});
/** OpenAPI / request wire shape. */
export type Appointment = WireRow<typeof appointmentSchema>;
/** Loaded persistence row (`Date` columns, eager relations). */
export type AppointmentRow = SchemaPersistenceRow<typeof appointmentSchema>;
