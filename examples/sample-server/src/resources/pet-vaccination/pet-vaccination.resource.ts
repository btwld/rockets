import { Operation } from '@concepta/nestjs-common';
import { defineResource } from '@bitwild/rockets';
import { PetVaccinationEntity } from './pet-vaccination.entity';
import { PetEntity } from '../pet/pet.entity';
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
 *
 * The `relation()` helper declares the inverse of
 * `PetEntity.vaccinations`. The lazy `() => PetEntity` thunk avoids a
 * load-order cycle between `pet.entity.ts` and
 * `pet-vaccination.entity.ts`.
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
  relations: (relation) => [relation(() => PetEntity, 'pet')],
});
