import { Operation } from '@concepta/nestjs-common';
import { defineResource } from '@bitwild/rockets';
import { OwnerScopeHook } from '@bitwild/rockets-core';
import { AppointmentEntity } from './appointment.entity';
import {
  AppointmentCreateDto,
  AppointmentResponseDto,
} from './appointment.dto';
import { AppointmentCreateHandler } from './appointment-create.handler';
import {
  APPOINTMENT_ENTITY_KEY,
  REMINDER_ENTITY_KEY,
} from './appointment.constants';

/**
 * Create is handled by `AppointmentCreateHandler`, which wraps an
 * appointment write and a reminder write in `txScope.run()` so either
 * both or neither persist. Update intentionally omitted — rescheduling
 * an appointment needs to cascade reminder changes, which doesn't fit
 * a single PATCH.
 */
export const appointmentResource = defineResource({
  key: APPOINTMENT_ENTITY_KEY,
  entity: AppointmentEntity,
  path: 'appointments',
  tags: ['Appointments'],
  dto: {
    response: AppointmentResponseDto,
    create: AppointmentCreateDto,
  },
  operations: [
    Operation.List,
    Operation.Read,
    Operation.Create,
    Operation.Delete,
  ],
  relations: [{ target: REMINDER_ENTITY_KEY, propertyName: 'reminders' }],
  hooks: [OwnerScopeHook],
  handlers: { create: AppointmentCreateHandler },
});

export function createAppointmentResource(): typeof appointmentResource {
  return appointmentResource;
}
