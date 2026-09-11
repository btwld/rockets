import { withOpenApi } from '@concepta/rockets-core';

import { rocketsAuthInvitationSchema } from './rockets-auth-invitation.schema';

/**
 * `POST /admin/invitations` response: the invitation itself. Delivery is
 * not part of it — the email leaves from the transaction's commit hook,
 * after this response is built, so the route cannot know the outcome.
 * Failures are logged by `SendInvitationEmailHandler`; re-send through
 * `POST /admin/invitations/:code/reattempt`.
 */
export const rocketsAuthInvitationResponseSchema = withOpenApi(
  rocketsAuthInvitationSchema.extend({}),
  'RocketsAuthInvitationResponseDto',
);
