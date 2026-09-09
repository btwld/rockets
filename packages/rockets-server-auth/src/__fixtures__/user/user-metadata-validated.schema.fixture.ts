import { withOpenApi } from '@concepta/rockets-core';
import { z } from 'zod';

import { rocketsAuthUserMetadataSchema } from '../../domains/user/infrastructure/schemas/rockets-auth-user-metadata.schema';

/**
 * A user-metadata update schema that actually CONSTRAINS implementation
 * fields, so a `PATCH /me` payload can fail validation and exercise the
 * real `details` channel. Constraints are ranges rather than types on
 * purpose: a length ceiling and a numeric bound still fail on a
 * well-typed value.
 */
export const userMetadataValidatedUpdateSchemaFixture = withOpenApi(
  z.object({
    firstName: z.string().max(5).optional(),
    age: z.number().int().min(0).max(150).optional(),
  }),
  'UserMetadataValidatedUpdateDto',
);

export const userMetadataValidatedResponseSchemaFixture = withOpenApi(
  rocketsAuthUserMetadataSchema.extend({
    firstName: z.string().nullish(),
    age: z.number().nullish(),
  }),
  'UserMetadataValidatedDto',
);
