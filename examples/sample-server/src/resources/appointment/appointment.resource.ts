import { defineResource } from '@bitwild/rockets';
import { OwnerScopeHook } from '@bitwild/rockets-core';
import { AppointmentEntity } from './appointment.entity';

const AppointmentOwnerScope = OwnerScopeHook.for(AppointmentEntity);
import { ReminderEntity } from './reminder.entity';
import {
  AppointmentCreateDto,
  AppointmentResponseDto,
} from './appointment.dto';
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
  relations: (relation) => [relation(ReminderEntity, 'reminders')],
  hooks: [AppointmentOwnerScope],
  operations: {
    list: { response: AppointmentResponseDto },
    read: { response: AppointmentResponseDto },
    create: {
      body: AppointmentCreateDto,
      response: AppointmentResponseDto,
      handler: AppointmentCreateHandler,
    },
    delete: {},
  },
});
