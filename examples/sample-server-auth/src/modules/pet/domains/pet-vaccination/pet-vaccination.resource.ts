import { defineResource } from '@bitwild/rockets';
import { Operation } from '@bitwild/rockets-app';
import { PetVaccinationEntity } from './pet-vaccination.entity';
import { PetEntity } from '../pet/pet.entity';
import {
  PetVaccinationCreateDto,
  PetVaccinationDto,
  PetVaccinationUpdateDto,
} from './pet-vaccination.dto';

export const petVaccinationResource = defineResource({
  entity: PetVaccinationEntity,
  path: 'pet-vaccinations',
  tags: ['Pet Vaccinations'],
  // Inherits the root `repository` adapter from `RocketsModule.forRoot`.
  dto: {
    response: PetVaccinationDto,
    create: PetVaccinationCreateDto,
    update: PetVaccinationUpdateDto,
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
