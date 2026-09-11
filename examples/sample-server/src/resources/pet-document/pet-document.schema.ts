import { z } from 'zod';
import { withOpenApi } from '@concepta/rockets-core';

export const PET_DOCUMENT_MAX_BYTES = 8 * 1024 * 1024;

export const petDocumentUploadSchema = withOpenApi(
  z.object({
    title: z.string().min(1).max(255),
    contentType: z.enum(['application/pdf', 'text/plain']),
    data: z.base64(),
  }),
  'PetDocumentUploadDto',
);
export type PetDocumentUploadBody = z.output<typeof petDocumentUploadSchema>;

export const petDocumentResponseSchema = withOpenApi(
  z.object({
    id: z.uuid(),
    petId: z.uuid(),
    title: z.string(),
    storageKey: z.string(),
    contentType: z.string(),
    size: z.int(),
    store: z.string(),
    dateCreated: z.date(),
  }),
  'PetDocumentResponseDto',
);
export type PetDocumentResponse = z.output<typeof petDocumentResponseSchema>;

export const petDocumentListResponseSchema = withOpenApi(
  z.array(petDocumentResponseSchema),
);

export const petDocumentArchiveResultSchema = withOpenApi(
  z.object({
    archived: z.array(z.string()),
    skipped: z.array(z.string()),
  }),
  'PetDocumentArchiveResultDto',
);
export type PetDocumentArchiveResult = z.output<
  typeof petDocumentArchiveResultSchema
>;
