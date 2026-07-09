import { z } from 'zod';
import { createdEntity, f, SchemaPersistenceRow } from '@bitwild/rockets-core/zod';
import { zodEntityCompiler } from '../../zod-bindings';
import { AppointmentEntity } from './appointment.entity';

/**
 * Zod source of truth for the reminder resource (replaces the
 * handwritten `reminder.entity.ts` + `ReminderResponseDto`).
 *
 * `appointmentId` carries the relation meta: the generated entity gains
 * the FK uuid column plus a `@ManyToOne(AppointmentEntity)` /
 * `@JoinColumn` relation property — appointment itself stays a classic
 * handwritten entity, demonstrating the entity-class target form.
 * `include: 'default'` contributes the same `ResourceRelationEntry` the
 * old `relations: (relation) => [...]` builder declared.
 *
 * NOT an isomorphic module (unlike tag.schema): the relation target is
 * the server-side entity class, so this schema is server-only by
 * nature.
 *
 * The entity class is compiled HERE — not inside `zodResource()` — so
 * `ReminderOwnerScopeHook` can bind to it via `@EntityHook` without a
 * module cycle (reminder.zod imports the hook; the hook imports only
 * this file).
 */
export const reminderSchema = createdEntity({
  // appointment is a classic handwritten entity (no zod schema), so this
  // relation targets the entity class — the entity-class target form.
  appointmentId: f.fk(() => AppointmentEntity, { include: 'default' }),
  sendAt: z.iso.datetime(),
  sent: f.bool({
    default: false,
    description: 'Whether the reminder was dispatched',
  }),
});

/**
 * Wire row type (`sendAt` / `dateCreated` are ISO strings on the wire;
 * persistence rows carry `Date` objects in those columns). Use this for
 * static typing — never the generated entity class.
 */
export type Reminder = z.infer<typeof reminderSchema>;
export type ReminderRow = SchemaPersistenceRow<typeof reminderSchema>;

/**
 * Generated entity class (named `ReminderEntity`, table `reminders`).
 * Referenced by `AppointmentEntity.reminders` (`@OneToMany`), the
 * appointment create handler (`@InjectDynamicRepository`) and the
 * owner-scope hook (`@EntityHook`), exactly like the old handwritten
 * class.
 */
export const ReminderEntity = zodEntityCompiler.compileEntity(reminderSchema, {
  name: 'ReminderEntity',
  table: 'reminders',
});
