import { Operation } from '@concepta/nestjs-common';
import { defineResource } from '@bitwild/rockets';
import { ReminderEntity } from './reminder.entity';
import { ReminderResponseDto } from './appointment.dto';
import { ReminderOwnerScopeHook } from './reminder-owner-scope.hook';
import { REMINDER_ENTITY_KEY } from './appointment.constants';

/**
 * Read-only — reminder lifecycle is owned by `AppointmentCreateHandler`
 * and future workflows (mark-sent, reschedule), not direct CRUD.
 */
export const reminderResource = defineResource({
  key: REMINDER_ENTITY_KEY,
  entity: ReminderEntity,
  path: 'reminders',
  tags: ['Reminders'],
  dto: { response: ReminderResponseDto },
  operations: [Operation.List, Operation.Read],
  hooks: [ReminderOwnerScopeHook],
});

export function createReminderResource(): typeof reminderResource {
  return reminderResource;
}
