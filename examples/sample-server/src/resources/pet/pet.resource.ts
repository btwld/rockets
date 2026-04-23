import { defineResource } from '@bitwild/rockets';
import { Operation } from '@concepta/nestjs-common';
import { PetEntity } from './pet.entity';
import { PET_ENTITY_KEY } from './pet.constants';
import { PetCreateDto, PetUpdateDto, PetResponseDto } from './pet.dto';
import { PetCreateHandler } from './pet-create.handler';
import { PetUpdateHandler } from './pet-update.handler';
import { PetOwnerOrSharedHook } from '../pet-share/pet-owner-or-shared.hook';
import { AuditLogHook } from '../../audit/audit-log.hook';
import { PET_VACCINATION_ENTITY_KEY } from '../pet-vaccination/pet-vaccination.constants';
import { TAG_ENTITY_KEY } from '../tag/tag.constants';
import { PetTagSyncer } from './pet-tag.syncer';

/**
 * `PetOwnerOrSharedHook` applies two scopes depending on the CRUD op:
 * List/Read broaden to "owner OR shared" so recipients see pets shared
 * with them; Update/Delete/Replace stay strict-owner, so shared users
 * get 404 when they try to mutate. Create stamps `userId` via
 * `PetCreateHandler` (can't do it from a where-clause).
 */
export const petResource = defineResource({
  key: PET_ENTITY_KEY,
  entity: PetEntity,
  path: 'pets',
  tags: ['Pets'],
  dto: {
    response: PetResponseDto,
    create: PetCreateDto,
    update: PetUpdateDto,
  },
  operations: [
    Operation.List,
    Operation.Read,
    Operation.Create,
    Operation.Update,
    Operation.SoftDelete,
    Operation.Restore,
  ],
  relations: [
    { target: PET_VACCINATION_ENTITY_KEY, propertyName: 'vaccinations' },
    { target: TAG_ENTITY_KEY, propertyName: 'tags' },
  ],
  hooks: [PetOwnerOrSharedHook, AuditLogHook],
  handlers: { create: PetCreateHandler, update: PetUpdateHandler },
  providers: [PetTagSyncer],
  overrides: {
    operations: {
      [Operation.SoftDelete]: { response: { returnDeleted: true } },
      [Operation.Restore]: { response: { returnRestored: true } },
    },
  },
});

export function createPetResource(): typeof petResource {
  return petResource;
}
