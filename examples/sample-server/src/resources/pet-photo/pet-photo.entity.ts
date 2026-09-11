import { z } from 'zod';
import { f, rocketsEntityMeta, rocketsFieldMeta } from '@concepta/rockets-core/zod';
import { zodEntityCompiler } from '../../zod-bindings';

/**
 * Metadata row for one stored photo. The BYTES live in the storage store;
 * this table owns only what the database is good at — ownership, the key
 * to look the object up by, and what the object is.
 *
 * That split is the whole point of `@concepta/rockets-storage`: object
 * keys, tenancy and authorization stay application concerns, so the
 * `petId` scoping and the owner check live here, not in the driver.
 */
export const petPhotoSchema = z
  .object({
    id: f.pk(),
    petId: f.string({ max: 255, index: true }),
    /** Object key inside the `pet-photos` store — not a filesystem path. */
    storageKey: f.string({ max: 512 }),
    contentType: f.string({ max: 127 }),
    size: f.int(),
    uploadedBy: f.string({ max: 255, index: true }),
    dateCreated: z
      .date()
      .register(rocketsFieldMeta, { db: { createdAt: true } }),
  })
  .register(rocketsEntityMeta, { unique: [['storageKey']] });

export const PetPhotoEntity = zodEntityCompiler.compileEntity(petPhotoSchema, {
  name: 'PetPhotoEntity',
  table: 'pet_photo',
});
export type PetPhotoEntity = z.infer<typeof petPhotoSchema>;
