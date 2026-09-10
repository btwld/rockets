import { z } from 'zod';
import { auditableEntity, f } from '@concepta/rockets-core/zod';
import { defineUserMetadata } from './zod-bindings';

/**
 * Zod source of truth for user metadata. `defineUserMetadata` compiles it
 * into the `{ entity, updateSchema, responseSchema }` config the
 * `userMetadata` slot expects — `PATCH /me` validates with the update
 * schema, both `/me` routes serialize with the response schema. The base
 * fields (`id`, `userId`, timestamps, `version`) satisfy
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
