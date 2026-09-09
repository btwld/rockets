import { withOpenApi } from '@concepta/rockets-core';
import { z } from 'zod';

import { rocketsAuthInvitationSchema } from './rockets-auth-invitation.schema';

/**
 * `POST /admin/invitations` response: the invitation plus email delivery
 * status. The invitation is returned even when the email failed so admins
 * can retry through `POST /admin/invitations/:code/reattempt`.
 */
export const rocketsAuthInvitationResponseSchema = withOpenApi(
  rocketsAuthInvitationSchema.extend({
    emailSent: z.boolean().meta({
      description: 'Whether the invitation email was sent successfully',
      example: true,
    }),
    emailError: z.string().optional().meta({
      description:
        'Error message if email sending failed. Use POST /admin/invitations/:code/reattempt to retry.',
      example: 'SMTP connection timeout',
    }),
  }),
  'RocketsAuthInvitationResponseDto',
);
