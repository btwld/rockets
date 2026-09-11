import { z } from 'zod';
import { withOpenApi } from '@concepta/rockets-core';

/** 2 MB of raw bytes; base64 inflates by ~4/3, so the encoded cap is higher. */
export const PET_PHOTO_MAX_BYTES = 2 * 1024 * 1024;

const ALLOWED_CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

/**
 * `rockets-storage` deliberately ships no `multipart/form-data` parsing, so
 * an app that wants a browser file picker either adds its own multipart
 * middleware or does what this sample does: take the bytes base64-encoded
 * in a JSON body. Small images only — see `PET_PHOTO_MAX_BYTES`.
 */
export const petPhotoUploadSchema = withOpenApi(
  z.object({
    filename: z
      .string()
      .min(1)
      .max(255)
      .meta({ description: 'Original file name, used only for the extension.' }),
    contentType: z.enum(ALLOWED_CONTENT_TYPES).meta({
      description: 'Declared media type; stored with the object.',
    }),
    data: z
      .base64()
      .meta({ description: 'Base64-encoded image bytes.' }),
  }),
  'PetPhotoUploadDto',
);
export type PetPhotoUploadBody = z.output<typeof petPhotoUploadSchema>;

export const petPhotoResponseSchema = withOpenApi(
  z.object({
    id: z.uuid(),
    petId: z.uuid(),
    storageKey: z.string(),
    contentType: z.string(),
    size: z.int(),
    uploadedBy: z.uuid(),
    dateCreated: z.date(),
  }),
  'PetPhotoResponseDto',
);
export type PetPhotoResponse = z.output<typeof petPhotoResponseSchema>;

export const petPhotoListResponseSchema = withOpenApi(
  z.array(petPhotoResponseSchema),
);

export const petPhotoDownloadUrlSchema = withOpenApi(
  z.object({
    url: z.string().meta({ description: 'URL the client can fetch the bytes from.' }),
    expiresIn: z
      .int()
      .nullable()
      .meta({
        description:
          'Seconds the URL stays valid, or null when the store cannot ' +
          'guarantee an expiry (it then serves a non-expiring URL).',
      }),
  }),
  'PetPhotoDownloadUrlDto',
);
export type PetPhotoDownloadUrl = z.output<typeof petPhotoDownloadUrlSchema>;
