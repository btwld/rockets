import { withOpenApi } from '@concepta/rockets-core';

import { rocketsAuthInvitationSchema } from './rockets-auth-invitation.schema';

/**
 * `POST /admin/invitations` response: the invitation plus email delivery
 * status. The invitation is returned even when the email failed so admins
 * can retry through `POST /admin/invitations/:code/reattempt`.
 */
export const rocketsAuthInvitationResponseSchema = withOpenApi(
  rocketsAuthInvitationSchema.extend({}),
  'RocketsAuthInvitationResponseDto',
);
