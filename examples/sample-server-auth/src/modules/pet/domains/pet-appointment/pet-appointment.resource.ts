import { defineResource } from '@concepta/rockets';
import { Operation } from '@concepta/nestjs-core';
import { PetAppointmentEntity } from './pet-appointment.entity';
import { PetEntity } from '../pet/pet.entity';
import {
  petAppointmentCreateSchema,
  petAppointmentResponseSchema,
  petAppointmentUpdateSchema,
} from './pet-appointment.schemas';

export const petAppointmentResource = defineResource({
  entity: PetAppointmentEntity,
  path: 'pet-appointments',
  tags: ['Pet Appointments'],
  // Inherits the root `repository` adapter from `RocketsModule.forRoot`.
  dto: {
    response: petAppointmentResponseSchema,
    create: petAppointmentCreateSchema,
    update: petAppointmentUpdateSchema,
  },
  operations: [
    Operation.List,
    Operation.Read,
    Operation.Create,
    Operation.Update,
    Operation.Delete,
  ],
  // Inverse of PetEntity.@OneToMany('appointments').
  relations: (relation) => [relation(() => PetEntity, 'pet')],
});

export function createPetAppointmentResource(): typeof petAppointmentResource {
  return petAppointmentResource;
}
