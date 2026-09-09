import { defineResource } from '@concepta/rockets';
import { OwnerScopeHook } from '@concepta/rockets-core';
import { AppointmentEntity } from './appointment.entity';

const AppointmentOwnerScope = OwnerScopeHook.for(AppointmentEntity);
import { ReminderEntity } from './reminder.schema';
import {
  appointmentCreateSchema,
  appointmentResponseSchema,
} from './appointment.schemas';
import { AppointmentCreateHandler } from './appointment-create.handler';

/**
 * Create is handled by `AppointmentCreateHandler`, which wraps an
 * appointment write and a reminder write in `txScope.run()` so either
 * both or neither persist. Update intentionally omitted — rescheduling
 * an appointment needs to cascade reminder changes, which doesn't fit
 * a single PATCH.
 */
export const appointmentResource = defineResource({
  entity: AppointmentEntity,
  // key / path / tags omitted — derived from `AppointmentEntity` →
  // `'appointment'` → `appointments` / `['Appointments']`.
  // Thunk form: `ReminderEntity` is generated in reminder.schema.ts,
  // which imports appointment.entity — the lazy reference sidesteps the
  // module cycle (same reason the old entity pair used lazy thunks).
  relations: (relation) => [relation(() => ReminderEntity, 'reminders')],
  hooks: [AppointmentOwnerScope],
  operations: {
    list: { output: appointmentResponseSchema },
    read: { output: appointmentResponseSchema },
    create: {
      input: appointmentCreateSchema,
      output: appointmentResponseSchema,
      handler: AppointmentCreateHandler,
    },
    delete: {},
  },
});
