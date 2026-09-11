import { z } from 'zod';
import { f, rocketsEntityMeta, rocketsFieldMeta } from '@concepta/rockets-core/zod';
import { zodEntityCompiler } from '../../zod-bindings';

/**
 * Vet records and similar attachments. Bigger and more numerous than
 * photos, which is the point: this feature exercises the parts of the
 * storage contract a single small upload never reaches — streamed reads,
 * byte ranges, bulk delete, and moving objects between two stores.
 */
export const petDocumentSchema = z
  .object({
    id: f.pk(),
    petId: f.string({ max: 255, index: true }),
    title: f.string({ max: 255 }),
    storageKey: f.string({ max: 512 }),
    contentType: f.string({ max: 127 }),
    size: f.int(),
    /** Which named store currently holds the bytes. */
    store: f.string({ max: 64 }),
    dateCreated: z
      .date()
      .register(rocketsFieldMeta, { db: { createdAt: true } }),
  })
  .register(rocketsEntityMeta, { unique: [['store', 'storageKey']] });

export const PetDocumentEntity = zodEntityCompiler.compileEntity(
  petDocumentSchema,
  { name: 'PetDocumentEntity', table: 'pet_document' },
);
export type PetDocumentEntity = z.infer<typeof petDocumentSchema>;
