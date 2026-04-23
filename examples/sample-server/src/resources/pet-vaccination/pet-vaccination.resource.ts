import { Operation } from '@concepta/nestjs-common';
import { defineResource } from '@bitwild/rockets';
import { PetVaccinationEntity } from './pet-vaccination.entity';
import {
  PetVaccinationCreateDto,
  PetVaccinationResponseDto,
} from './pet-vaccination.dto';
import { PET_VACCINATION_ENTITY_KEY } from './pet-vaccination.constants';

/**
 * Pet vaccination resource.
 *
 * Exposes List/Read/Create/Delete (no Update). Paginated DTO is
 * auto-generated from `PetVaccinationResponseDto` — no hand-written
 * paginated class is required.
 */
export const petVaccinationResource = defineResource({
  key: PET_VACCINATION_ENTITY_KEY,
  entity: PetVaccinationEntity,
  path: 'pet-vaccinations',
  tags: ['Pet Vaccinations'],
  dto: {
    response: PetVaccinationResponseDto,
    create: PetVaccinationCreateDto,
  },
  operations: [
    Operation.List,
    Operation.Read,
    Operation.Create,
    Operation.Delete,
  ],
});

export function createPetVaccinationResource(): typeof petVaccinationResource {
  return petVaccinationResource;
}
