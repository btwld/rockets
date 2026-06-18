import { zodResource } from '../../zod-bindings';
import { Reminder, reminderSchema } from './reminder.schema';
import { ReminderOwnerScopeHook } from './reminder-owner-scope.hook';

/**
 * Read-only — reminder lifecycle is owned by `AppointmentCreateHandler`
 * and future workflows (mark-sent, reschedule), not direct CRUD.
 *
 * Fully zod-driven twin of the old `reminder.resource.ts`: the response
 * DTO comes from `reminderSchema`, the entity is the generated
 * `ReminderEntity` (compiled in reminder.schema.ts and reused here via
 * the schema registry — no `entity:` override), the cross-resource
 * relation to appointments comes from the `relation` meta on
 * `appointmentId`, and the owner-scope hook passes straight through to
 * `defineResource`.
 */
export const reminderZodResource = zodResource({
  name: 'Reminder',
  schema: reminderSchema,
  hooks: [ReminderOwnerScopeHook],
  operations: { list: true, read: true },
});

/**
 * Generated response DTO (component name `ReminderResponseDto`).
 * `AppointmentResponseDto` nests it for the eager `reminders` array —
 * one class serves both the `/reminders` routes and the nested
 * projection, exactly like the old handwritten DTO did.
 */
export const ReminderResponseDto = reminderZodResource.zod.dtos.response;
export type ReminderResponseDto = Reminder;
