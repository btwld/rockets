import { z } from 'zod';
import { withOpenApi } from '@concepta/rockets-core';
import { f } from '@concepta/rockets-core/zod';
import { appointmentSchema } from './appointment.entity';
import { reminderResponseSchema } from './reminder.zod';

/**
 * Request/response schemas for the classic `defineResource` appointment.
 * Both derive from `appointmentSchema` (the entity source of truth); what
 * exceeds a pure CRUD projection is spelled out here:
 *
 * - create carries a non-column `reminderSendAt` consumed by
 *   `AppointmentCreateHandler`; `date`/`reminderSendAt` are `f.date()` so
 *   the ISO strings clients send coerce to the `Date` the handler and the
 *   columns expect;
 * - the response embeds the reminder resource's own named response schema,
 *   so the nested rows document as a `$ref` to the single
 *   `ReminderResponseDto` component the `/reminders` routes emit.
 *
 * `withOpenApi` is the LAST call on purpose — `.extend()` after it would
 * drop the component id.
 */
export const appointmentResponseSchema = withOpenApi(
  appointmentSchema.extend({
    reminders: z.array(reminderResponseSchema).optional(),
  }),
  'AppointmentResponseDto',
);

export const appointmentCreateSchema = withOpenApi(
  appointmentSchema.pick({ notes: true }).extend({
    petId: z.uuid(),
    date: f.date(),
    reminderSendAt: f.date({
      description: 'When to send the reminder (must be before `date`).',
    }),
  }),
  'AppointmentCreateDto',
);
export type AppointmentCreate = z.output<typeof appointmentCreateSchema>;
