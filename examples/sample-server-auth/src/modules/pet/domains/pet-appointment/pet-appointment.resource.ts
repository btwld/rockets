import { defineResource } from '@bitwild/rockets';
import { Operation } from '@concepta/nestjs-common';
import { TypeOrmRepositoryModule } from '@concepta/nestjs-repository-typeorm';
import { PetAppointmentEntity } from './pet-appointment.entity';
import { PetEntity } from '../pet/pet.entity';
import {
  PetAppointmentCreateDto,
  PetAppointmentDto,
  PetAppointmentUpdateDto,
} from './pet-appointment.dto';

export const petAppointmentResource = defineResource({
  entity: PetAppointmentEntity,
  path: 'pet-appointments',
  tags: ['Pet Appointments'],
  // See sister `pet.resource.ts` for why each bundle owns the adapter.
  persistence: { module: TypeOrmRepositoryModule },
  dto: {
    response: PetAppointmentDto,
    create: PetAppointmentCreateDto,
    update: PetAppointmentUpdateDto,
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
