import { defineResource, defineSubResource } from '@bitwild/rockets';
import { OwnerStampHook } from '@bitwild/rockets-core';
import { PetEntity } from './pet.entity';
import { PetCreateDto, PetUpdateDto, PetResponseDto } from './pet.dto';
import { PetOwnerOrSharedHook } from '../pet-share/pet-owner-or-shared.hook';
import { AuditLogHook } from '../../audit/audit-log.hook';
import { PetVaccinationEntity } from '../pet-vaccination/pet-vaccination.entity';
import { PetTagEntity } from './pet-tag.entity';
import { TagEntity } from '../tag/tag.entity';
import { PetTagCreateDto, PetTagResponseDto } from './pet-tag.dto';
import { PetCreatedEventHook } from '../../events/pet-created-event.hook';
import { PetUniqueRefHook } from './pet-unique-ref.hook';
import { PetTagTagIdExistsHook } from './pet-tag-tag-id-exists.hook';

const PetOwnerStamp = OwnerStampHook.for(PetEntity);
const PetAuditLogHook = AuditLogHook.for(PetEntity);

/**
 * Hook stack and what each one owns:
 *
 * - {@link OwnerStampHook} — `beforeCreate`/`beforeUpdate` stamp `userId`
 *   from the actor and reject spoofing.
 * - {@link PetOwnerOrSharedHook} — `beforeFindAndCount` / `beforeFindOne`
 *   broaden read scope to "owner OR shared user" while keeping writes
 *   strict-owner.
 * - {@link PetUniqueRefHook} — `beforeCreate` rejects duplicate
 *   `uniqueRef` with `409 Conflict` (no custom create handler).
 * - {@link AuditLogHook} — `afterCreate` / `afterUpdate` / `afterSoftDelete`
 *   write to the audit trail.
 * - {@link PetCreatedEventHook} — `afterCreate` publishes
 *   `PetCreatedEvent` for downstream listeners (welcome email).
 *
 * Pet ↔ Tag many-to-many is exposed as a nested sub-resource at
 * `/pets/:petId/tags`. `defineSubResource` composes the path, declares
 * `request.params: { id, petId }`, applies `@ApiParam(:petId)` on every
 * op, and auto-injects a `PathScopeHook` that filters reads by `petId`
 * and stamps the FK on creates — eliminating the per-junction
 * boilerplate that previously lived in a separate `pet-tag.resource.ts`.
 * {@link PetTagTagIdExistsHook} validates `tagId` on create (no custom handler).
 */
export const petResource = defineResource({
  entity: PetEntity,
  // path / tags omitted — derived as `pets` / `['Pets']` from the key.
  relations: (relation) => [
    relation(PetVaccinationEntity, 'vaccinations'),
    relation(PetTagEntity, 'petTags'),
  ],
  hooks: [
    PetOwnerStamp,
    PetOwnerOrSharedHook,
    PetUniqueRefHook,
    PetAuditLogHook,
    PetCreatedEventHook,
  ],
  operations: {
    list: { response: PetResponseDto },
    read: { response: PetResponseDto },
    create: {
      body: PetCreateDto,
      response: PetResponseDto,
    },
    update: { body: PetUpdateDto, response: PetResponseDto },
    delete: { soft: true, returnDeleted: true },
    restore: { returnRestored: true },
  },
  subResources: {
    // The key MUST be a property of `PetEntity` — `petTags` is the
    // junction relation declared on the entity. The URL segment is
    // overridden to `tags` for a friendlier route (default would be
    // kebab-cased `pet-tags`). The sub's entity type is inferred from
    // the `entity` field — no need to repeat it as a generic.
    petTags: defineSubResource({
      entity: PetTagEntity,
      hooks: [PetTagTagIdExistsHook],
      tags: ['Pet Tags'],
      urlSegment: 'tags',
      // `parentOwnerColumn` is required: the auto guard checks that
      // the actor owns the parent pet. `userId` matches PetEntity's
      // ownership column.
      parentOwnerColumn: 'userId',
      // Eager `tag` relation needs reloading because TypeORM `save()`
      // omits eager loads. Opt-in to keep the cost explicit.
      reloadAfterCreate: true,
      relations: (relation) => [
        relation(() => PetEntity, 'pet'),
        relation(() => TagEntity, 'tag'),
      ],
      // PathScopeHook (filter by :petId, stamp petId on create) and
      // PathScopeGuard (authenticated actor + parent owner check) are
      // auto-injected by defineSubResource.
      operations: {
        list: { response: PetTagResponseDto },
        read: { response: PetTagResponseDto },
        create: {
          body: PetTagCreateDto,
          response: PetTagResponseDto,
        },
        delete: {},
      },
    }),
  },
});
