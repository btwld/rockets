import { z } from 'zod';
import { f, rocketsEntityMeta, rocketsFieldMeta } from '@bitwild/rockets-core/zod';
import { zodEntityCompiler } from '../../zod-bindings';

export enum PetSharePermission {
  READ = 'read',
  // Write intentionally omitted — shared-user writes are out of scope for
  // the sample app. Extend here if the product later allows it.
}

/**
 * Join row recording "user X has been granted access to pet Y by pet's
 * owner". Explicit entity (own id, created-at, permission) queried directly
 * by `PetOwnerOrSharedHook` and managed via `PetShareController`. Zod-sourced
 * — the controller/service/hook keep their own DTOs and inject
 * `PetShareEntity` (value) typed by the same-named row type below.
 */
export const petShareSchema = z
  .object({
    id: f.pk(),
    petId: f.string({ max: 255, index: true }),
    userId: f.string({ max: 255, index: true }),
    permission: f.enum(PetSharePermission, {
      default: PetSharePermission.READ,
      length: 20,
    }),
    dateCreated: z
      .date()
      .register(rocketsFieldMeta, { db: { createdAt: true } }),
  })
  .register(rocketsEntityMeta, { unique: [['petId', 'userId']] });

export const PetShareEntity = zodEntityCompiler.compileEntity(petShareSchema, {
  name: 'PetShareEntity',
  table: 'pet_share',
});
/** Persistence row type — shares the name with the entity class (value + type). */
export type PetShareEntity = z.infer<typeof petShareSchema>;
