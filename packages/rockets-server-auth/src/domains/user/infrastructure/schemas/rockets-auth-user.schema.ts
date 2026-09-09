import { userSchema } from '@concepta/nestjs-user';
import { withOpenApi } from '@concepta/rockets-core';
import type { z } from 'zod';

import { deriveOnce } from './derive-once.util';

function composeRocketsAuthUserSchema(userMetadataResponse: z.ZodType) {
  return withOpenApi(
    userSchema.extend({
      // LEFT-joined relation: `null` when the user has no metadata row yet.
      userMetadata: userMetadataResponse.nullish().meta({
        description: 'User metadata containing additional profile information',
      }),
    }),
    'RocketsAuthUserDto',
  );
}

export type RocketsAuthUserSchema = ReturnType<
  typeof composeRocketsAuthUserSchema
>;

const cache = new WeakMap<z.ZodType, RocketsAuthUserSchema>();

/**
 * Response schema of `/signup` and `/admin/users` (`RocketsAuthUserDto`):
 * the upstream user plus the app's userMetadata response projection.
 */
export function rocketsAuthUserSchema(
  userMetadataResponse: z.ZodType,
): RocketsAuthUserSchema {
  return deriveOnce(cache, userMetadataResponse, () =>
    composeRocketsAuthUserSchema(userMetadataResponse),
  );
}
