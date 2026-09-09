import { withOpenApi } from '@concepta/rockets-core';
import { z } from 'zod';

/**
 * Public invitation-acceptance `payload`. Loose on purpose: the default
 * listener only applies `password` / `userMetadata`, and application
 * listeners may read extra keys. The nested `userMetadata` shape is
 * validated again by the configured update schema inside the listener.
 */
export const rocketsAuthInvitationAcceptancePayloadSchema = withOpenApi(
  z
    .object({
      password: z.string().min(8).optional().meta({
        description: 'Password to set on the invited user account',
      }),
      userMetadata: z.record(z.string(), z.unknown()).optional().meta({
        description: 'Optional profile metadata applied on acceptance',
      }),
    })
    .loose(),
  'RocketsAuthInvitationAcceptancePayloadDto',
);
