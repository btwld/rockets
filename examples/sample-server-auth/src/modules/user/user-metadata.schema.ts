import { rocketsAuthUserMetadataSchema } from '@concepta/rockets-auth';
import { withOpenApi } from '@concepta/rockets-core';
import { z } from 'zod';

/**
 * App-owned profile fields stored on `UserMetadataEntity`. Declared once
 * and projected twice below: optional on the patch, nullish on the wire
 * (an unset nullable column loads as `null`).
 */
const firstName = z
  .string()
  .min(1, 'First name must be at least 1 character')
  .max(100, 'First name cannot exceed 100 characters')
  .meta({ description: 'User first name', example: 'John' });

const lastName = z
  .string()
  .min(1, 'Last name must be at least 1 character')
  .max(100, 'Last name cannot exceed 100 characters')
  .meta({ description: 'User last name', example: 'Doe' });

const username = z
  .string()
  .min(3, 'Username must be at least 3 characters')
  .max(50, 'Username cannot exceed 50 characters')
  .meta({ description: 'Username', example: 'johndoe' });

const bio = z.string().max(500, 'Bio cannot exceed 500 characters').meta({
  description: 'User bio',
  example: 'Software developer passionate about clean code',
});

/**
 * `userMetadata` patch accepted by signup, `/admin/users`, invitation
 * acceptance and `PATCH /me`. The base columns (`id`, `userId`, audit)
 * are never writable through the API.
 */
export const userMetadataUpdateSchema = withOpenApi(
  z.object({
    firstName: firstName.optional(),
    lastName: lastName.optional(),
    username: username.optional(),
    bio: bio.optional(),
  }),
  'UserMetadataUpdateDto',
);

/** Wire projection of the stored row, nested under `user.userMetadata`. */
export const userMetadataResponseSchema = withOpenApi(
  rocketsAuthUserMetadataSchema.extend({
    firstName: firstName.nullish(),
    lastName: lastName.nullish(),
    username: username.nullish(),
    bio: bio.nullish(),
  }),
  'UserMetadataDto',
);

export type UserMetadataUpdate = z.output<typeof userMetadataUpdateSchema>;
export type UserMetadataResponse = z.output<typeof userMetadataResponseSchema>;
