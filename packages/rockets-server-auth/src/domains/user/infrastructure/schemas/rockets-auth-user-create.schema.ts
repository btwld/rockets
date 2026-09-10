import { userCreateSchema, userPasswordSchema } from '@concepta/nestjs-user';
import { withOpenApi } from '@concepta/rockets-core';
import { z } from 'zod';

import { deriveOnce } from './derive-once.util';

function composeRocketsAuthUserCreateSchema(userMetadataUpdate: z.ZodType) {
  return withOpenApi(
    z.object({
      email: userCreateSchema.shape.email,
      username: userCreateSchema.shape.username,
      active: userCreateSchema.shape.active,
      password: userPasswordSchema.shape.password,
      userMetadata: userMetadataUpdate.optional().meta({
        description: 'User metadata containing additional profile information',
      }),
    }),
    'RocketsAuthUserCreateDto',
  );
}

export type RocketsAuthUserCreateSchema = ReturnType<
  typeof composeRocketsAuthUserCreateSchema
>;

const cache = new WeakMap<z.ZodType, RocketsAuthUserCreateSchema>();

/**
 * `/signup` body (`RocketsAuthUserCreateDto`): upstream user create fields,
 * a required plain password, and the app's userMetadata patch.
 */
export function rocketsAuthUserCreateSchema(
  userMetadataUpdate: z.ZodType,
): RocketsAuthUserCreateSchema {
  return deriveOnce(cache, userMetadataUpdate, () =>
    composeRocketsAuthUserCreateSchema(userMetadataUpdate),
  );
}
