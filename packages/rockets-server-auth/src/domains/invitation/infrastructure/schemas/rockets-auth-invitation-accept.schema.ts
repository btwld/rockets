import { invitationAcceptSchema } from '@concepta/nestjs-invitation';
import { withOpenApi } from '@concepta/rockets-core';

import { rocketsAuthInvitationAcceptancePayloadSchema } from './rockets-auth-invitation-acceptance-payload.schema';

/**
 * `PATCH /invitation-acceptance/:code` body — upstream shape with the
 * Rockets payload contract, so `password` / `userMetadata` are checked at
 * the HTTP boundary instead of inside the event listener.
 */
export const rocketsAuthInvitationAcceptSchema = withOpenApi(
  invitationAcceptSchema.extend({
    payload: rocketsAuthInvitationAcceptancePayloadSchema.optional(),
  }),
  'RocketsAuthInvitationAcceptDto',
);
