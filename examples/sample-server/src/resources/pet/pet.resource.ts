import { zodResource, zodSubResource } from '../../zod-bindings';
import { PetEntity, petSchema } from './pet.schema';
import { PetOwnerOrSharedHook } from '../pet-share/pet-owner-or-shared.hook';
import { AuditLogHook } from '../../audit/audit-log.hook';
import { petTagSchema } from './pet-tag.schema';
import { PetCreatedEventHook } from '../../events/pet-created-event.hook';
import { PetUniqueRefHook } from './pet-unique-ref.hook';
import { PetNameNormalizeHook } from './pet-name-normalize.hook';
import { PetTagTagIdExistsHook } from './pet-tag-tag-id-exists.hook';
import { PetCreateHandler } from './pet-create.handler';

const PetAuditLogHook = AuditLogHook.for(PetEntity);

/**
 * Fully zod-driven: entity, DTO projections and relations all come from
 * `petSchema` (pet.schema.ts) — see the mapping table there.
 *
 * Hook stack and what each one owns:
 *
 * - `OwnerStampHook` — auto-wired by the zod layer from `owner: 'userId'`
 *   below; `beforeCreate`/`beforeUpdate` stamp `userId` from the actor and
 *   reject spoofing. (Opt out with `ownerStamp: false`.)
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
 * Pet ↔ Tag many-to-many stays exposed as the zod sub-resource at
 * `/pets/:petId/tags`. The vaccination/junction relation entries come
 * from the `relation` meta on the schema (`include: 'default'`).
 */
export const petResource = zodResource({
  name: 'Pet',
  schema: petSchema,
  // No `entity:` — `PetEntity` was compiled from this same schema in
  // pet.schema.ts (eagerly, so hooks/relations can import it without a
  // cycle); zodResource reuses that registered class.
  // key / path / tags derived: `pet` → `pets` / `['Pets']`.
  owner: 'userId', // stamps userId from the actor + excludes it from create/update
  hooks: [
    // OwnerStampHook for `userId` is auto-wired from `owner` (prepended
    // ahead of these).
    PetOwnerOrSharedHook,
    PetNameNormalizeHook,
    PetUniqueRefHook,
    PetAuditLogHook,
    PetCreatedEventHook,
  ],
  operations: {
    list: true,
    read: true,
    // Reference: a zod resource with a custom command handler. `input`/
    // `output` DTOs still come from the schema; only the create command
    // path is overridden. The handler delegates to the stock CRUD write
    // (see PetCreateHandler) — the seam is what's being demonstrated.
    create: { handler: PetCreateHandler },
    update: true,
    delete: { soft: true, returnDeleted: true },
    restore: { returnRestored: true },
  },
  subResources: {
    petTags: zodSubResource({
      name: 'PetTag',
      schema: petTagSchema,
      // No `entity:` — `PetTagEntity` is the class compiled from this
      // schema in pet-tag.schema.ts; zodSubResource reuses it.
      hooks: [PetTagTagIdExistsHook],
      tags: ['Pet Tags'],
      segment: 'tags',
      // `owner` defaults to 'userId'; declared here for clarity. The auto
      // guard checks the actor owns the parent pet via this column. Set
      // `owner: false` for a public parent.
      owner: 'userId',
      // Eager `tag` relation needs reloading because TypeORM `save()`
      // omits eager loads. Opt-in to keep the cost explicit.
      reloadAfterCreate: true,
      // PathScopeHook (filter by :petId, stamp petId on create) and
      // PathScopeGuard (authenticated actor + parent owner check) are
      // auto-injected by defineSubResource; the pet/tag relation entries
      // come from the schema's FK relation meta (`include: 'default'`).
      operations: { list: true, read: true, create: true, delete: true },
    }),
  },
});
