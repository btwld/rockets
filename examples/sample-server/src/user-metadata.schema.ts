import { z } from 'zod';
import { auditableEntity, f } from '@concepta/rockets-core/zod';
import { defineUserMetadata } from './zod-bindings';

/**
 * Zod source of truth for user metadata (replaces the handwritten
 * `entities/user-metadata.entity.ts` + `dto/user-metadata.dto.ts`).
 * `defineUserMetadata` compiles it into the `{ entity, updateSchema,
 * responseSchema }` config the `userMetadata` slot expects:
 *
 * - the base fields (`id`, `userId`, timestamps, `version`) are the
 *   `BaseUserMetadataEntityInterface` contract — required by the helper;
 * - `update` keeps the profile fields optional (`userId` immutable);
 *   `response` is the full row — the profile columns are nullable, and
 *   an unset one reads back as `null`, hence `.nullable().optional()`.
 */
export const userMetadataSchema = auditableEntity({
  userId: f.string({ max: 255, example: 'user-123' }),
  firstName: f
    .string({ min: 1, max: 100, example: 'John', description: 'User first name' })
    .nullable()
    .optional(),
  lastName: f
    .string({ min: 1, max: 100, example: 'Doe', description: 'User last name' })
    .nullable()
    .optional(),
  username: f
    .string({ min: 3, max: 50, example: 'johndoe', description: 'Username' })
    .nullable()
    .optional(),
  bio: f
    .string({ max: 500, description: 'User bio', text: true })
    .nullable()
    .optional(),
});

export type UserMetadata = z.infer<typeof userMetadataSchema>;

/**
 * The `{ entity, updateSchema, responseSchema }` config for the
 * `userMetadata` slot of `RocketsModule.forRoot` / `createServer`.
 */
export const userMetadataConfig = defineUserMetadata(userMetadataSchema, {
  name: 'UserMetadata',
  table: 'userMetadata',
});

/**
 * Generated entity + named schemas (`UserMetadataUpdateDto` /
 * `UserMetadataResponseDto` components), re-exported so the rest of the
 * app references them exactly like the old handwritten pair.
 */
export const UserMetadataEntity = userMetadataConfig.entity;
export const userMetadataUpdateSchema = userMetadataConfig.updateSchema;
export const userMetadataResponseSchema = userMetadataConfig.responseSchema;
