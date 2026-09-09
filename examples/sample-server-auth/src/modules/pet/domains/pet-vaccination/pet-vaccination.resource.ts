import { defineResource } from '@concepta/rockets';
import { Operation } from '@concepta/nestjs-core';
import { PetVaccinationEntity } from './pet-vaccination.entity';
import { PetEntity } from '../pet/pet.entity';
import {
  petVaccinationCreateSchema,
  petVaccinationResponseSchema,
  petVaccinationUpdateSchema,
} from './pet-vaccination.schemas';

export const petVaccinationResource = defineResource({
  entity: PetVaccinationEntity,
  path: 'pet-vaccinations',
  tags: ['Pet Vaccinations'],
  // Inherits the root `repository` adapter from `RocketsModule.forRoot`.
  dto: {
    response: petVaccinationResponseSchema,
    create: petVaccinationCreateSchema,
    update: petVaccinationUpdateSchema,
  },
  operations: [
    Operation.List,
    Operation.Read,
    Operation.Create,
    Operation.Update,
    Operation.Delete,
  ],
  // Inverse of PetEntity.@OneToMany('vaccinations'). Declared so relation
  // validation in `buildAppRegistrationPlan` accepts PetEntity as a known target
  // when the pet bundle joins back to vaccinations.
  relations: (relation) => [relation(() => PetEntity, 'pet')],
});

export function createPetVaccinationResource(): typeof petVaccinationResource {
  return petVaccinationResource;
}
