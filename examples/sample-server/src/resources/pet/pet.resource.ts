import { defineResource } from '@bitwild/rockets';
import { Operation } from '@concepta/nestjs-common';
import { OwnerStampHook } from '@bitwild/rockets-core';
import { PetEntity } from './pet.entity';
import { PET_ENTITY_KEY } from './pet.constants';
import { PetCreateDto, PetUpdateDto, PetResponseDto } from './pet.dto';
import { PetOwnerOrSharedHook } from '../pet-share/pet-owner-or-shared.hook';
import { AuditLogHook } from '../../audit/audit-log.hook';
import { PetVaccinationEntity } from '../pet-vaccination/pet-vaccination.entity';
import { PetTagEntity } from './pet-tag.entity';
import { PetCreatedEventHook } from '../../events/pet-created-event.hook';

/**
 * Hook stack and what each one owns:
 *
 * - {@link OwnerStampHook} — `BeforeCreate`/`BeforeUpdate` stamp `userId`
 *   from the actor and reject spoofing. Replaces the previous
 *   `PetCreateHandler` whose only job was injecting `userId` from the
 *   authenticated request.
 * - {@link PetOwnerOrSharedHook} — `BeforeFindAndCount` / `BeforeFindOne`
 *   broaden read scope to "owner OR shared user" while keeping writes
 *   strict-owner.
 * - {@link AuditLogHook} — `AfterCreate` / `AfterUpdate` / `AfterDelete`
 *   write to the audit trail.
 * - {@link PetCreatedEventHook} — `AfterCreate` publishes
 *   `PetCreatedEvent` for downstream listeners (welcome email).
 *
 * Tag attachment lives on the dedicated junction resource at
 * `/pets/:petId/tags`; this resource never touches the M:N pair.
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
  relations: (relation) => [
    relation(PetVaccinationEntity, 'vaccinations'),
    relation(PetTagEntity, 'petTags'),
  ],
  hooks: [
    OwnerStampHook,
    PetOwnerOrSharedHook,
    AuditLogHook,
    PetCreatedEventHook,
  ],
  overrides: {
    operations: {
      [Operation.SoftDelete]: { response: { returnDeleted: true } },
      [Operation.Restore]: { response: { returnRestored: true } },
    },
  },
});
