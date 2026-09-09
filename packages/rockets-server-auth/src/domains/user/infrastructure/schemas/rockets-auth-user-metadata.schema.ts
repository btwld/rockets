import { withOpenApi } from '@concepta/rockets-core';
import { z } from 'zod';

import type { UserMetadataConfigInterface } from '../../../../shared/interfaces/rockets-auth-options-extras.interface';

/**
 * Base user-metadata row: only the persistence columns every metadata
 * entity carries. Implementation fields (firstName, bio, …) belong in an
 * app schema built on top of this one (`rocketsAuthUserMetadataSchema.extend(...)`).
 */
export const rocketsAuthUserMetadataSchema = z.object({
  id: z.string().meta({ description: 'Metadata ID' }),
  userId: z.string().meta({ description: 'User ID' }),
  dateCreated: z.date().meta({ description: 'Date created' }),
  dateUpdated: z.date().meta({ description: 'Date updated' }),
  dateDeleted: z.date().nullable().meta({ description: 'Date deleted' }),
  version: z.number().meta({ description: 'Version' }),
});

/**
 * Default `userMetadata` patch: none of the base columns is writable
 * through the API, so an app that never extends the metadata accepts an
 * empty object and strips everything else.
 */
export const rocketsAuthUserMetadataUpdateSchema = withOpenApi(
  z.object({}),
  'RocketsAuthUserMetadataUpdateDto',
);

export const rocketsAuthUserMetadataResponseSchema = withOpenApi(
  rocketsAuthUserMetadataSchema.extend({}),
  'RocketsAuthUserMetadataDto',
);

/** The metadata schemas a module derives from — the app's, or the base defaults. */
export function resolveUserMetadataSchemas(
  config?: Pick<UserMetadataConfigInterface, 'updateSchema' | 'responseSchema'>,
): Pick<UserMetadataConfigInterface, 'updateSchema' | 'responseSchema'> {
  return {
    updateSchema: config?.updateSchema ?? rocketsAuthUserMetadataUpdateSchema,
    responseSchema:
      config?.responseSchema ?? rocketsAuthUserMetadataResponseSchema,
  };
}
