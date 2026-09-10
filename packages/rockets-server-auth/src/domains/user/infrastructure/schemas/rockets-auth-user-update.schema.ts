import { userCreateSchema, userUpdateSchema } from '@concepta/nestjs-user';
import { withOpenApi } from '@concepta/rockets-core';
import { z } from 'zod';

import { deriveOnce } from './derive-once.util';

function composeRocketsAuthUserUpdateSchema(userMetadataUpdate: z.ZodType) {
  return withOpenApi(
    z.object({
      username: userCreateSchema.shape.username.optional(),
      email: userUpdateSchema.shape.email,
      active: userUpdateSchema.shape.active,
      userMetadata: userMetadataUpdate.optional().meta({
        description: 'User metadata containing additional profile information',
      }),
    }),
    'RocketsAuthUserUpdateDto',
  );
}

export type RocketsAuthUserUpdateSchema = ReturnType<
  typeof composeRocketsAuthUserUpdateSchema
>;

const cache = new WeakMap<z.ZodType, RocketsAuthUserUpdateSchema>();

/**
 * `PATCH /admin/users/:id` body (`RocketsAuthUserUpdateDto`): every field
 * optional, including the app's userMetadata patch.
 */
export function rocketsAuthUserUpdateSchema(
  userMetadataUpdate: z.ZodType,
): RocketsAuthUserUpdateSchema {
  return deriveOnce(cache, userMetadataUpdate, () =>
    composeRocketsAuthUserUpdateSchema(userMetadataUpdate),
  );
}
