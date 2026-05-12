import { defineResource } from '@bitwild/rockets';
import { ReminderEntity } from './reminder.entity';
import { AppointmentEntity } from './appointment.entity';
import { ReminderResponseDto } from './appointment.dto';
import { ReminderOwnerScopeHook } from './reminder-owner-scope.hook';

/**
 * Read-only — reminder lifecycle is owned by `AppointmentCreateHandler`
 * and future workflows (mark-sent, reschedule), not direct CRUD.
 *
 * The `relation()` helper declares the inverse of
 * `AppointmentEntity.reminders`. The lazy `() => AppointmentEntity`
 * thunk avoids a load-order cycle between `appointment.entity.ts` and
 * `reminder.entity.ts`.
 */
export const reminderResource = defineResource({
  entity: ReminderEntity,
  // key / path / tags omitted — derived from `ReminderEntity` →
  // `'reminder'` → `reminders` / `['Reminders']`.
  relations: (relation) => [relation(() => AppointmentEntity, 'appointment')],
  hooks: [ReminderOwnerScopeHook],
  operations: {
    list: { response: ReminderResponseDto },
    read: { response: ReminderResponseDto },
  },
});
