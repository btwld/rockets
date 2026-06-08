import { defineResource } from '@bitwild/rockets';
import { PetVaccinationEntity } from './pet-vaccination.entity';
import { PetEntity } from '../pet/pet.entity';
import {
  PetVaccinationCreateDto,
  PetVaccinationResponseDto,
} from './pet-vaccination.dto';

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
  entity: PetVaccinationEntity,
  // key / path / tags omitted — derived from the entity class name:
  // `PetVaccinationEntity` → `petVaccination` → `pet-vaccinations` /
  // `['Pet Vaccinations']` (kebab-case + pluralize).
  relations: (relation) => [relation(() => PetEntity, 'pet')],
  operations: {
    list: { output: PetVaccinationResponseDto },
    read: { output: PetVaccinationResponseDto },
    create: {
      input: PetVaccinationCreateDto,
      output: PetVaccinationResponseDto,
    },
    delete: {},
  },
});
