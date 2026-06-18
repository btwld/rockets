import { z } from 'zod';
import { auditableEntity, f } from '@bitwild/rockets-zod';
import { defineUserMetadata } from './zod-bindings';

/**
 * Zod source of truth for user metadata (replaces the handwritten
 * `entities/user-metadata.entity.ts` + `dto/user-metadata.dto.ts`).
 * `defineUserMetadata` compiles it into the `{ entity, createDto,
 * updateDto, responseDto }` quad the `userMetadata` config slot expects.
 * The base fields (`id`, `userId`, timestamps, `version`) satisfy
 * `BaseUserMetadataEntityInterface`; `auditableEntity` supplies all but
 * `userId`.
 */
export const userMetadataSchema = auditableEntity({
  userId: f.string({ max: 255, example: 'firebase-user' }),
  firstName: f
    .string({ min: 1, max: 100, example: 'Thiago' })
    .optional(),
  lastName: f
    .string({ min: 1, max: 100, example: 'Ramalho' })
    .optional(),
});

export type UserMetadata = z.infer<typeof userMetadataSchema>;

export const userMetadataConfig = defineUserMetadata(userMetadataSchema, {
  name: 'UserMetadata',
  table: 'userMetadata',
});

/** Re-exported under the historical names so the rest of the app is unchanged. */
export const UserMetadataEntity = userMetadataConfig.entity;
export const UserMetadataCreateDto = userMetadataConfig.createDto;
export const UserMetadataUpdateDto = userMetadataConfig.updateDto;
