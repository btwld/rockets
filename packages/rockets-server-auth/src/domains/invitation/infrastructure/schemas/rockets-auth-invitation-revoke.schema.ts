import { withOpenApi } from '@concepta/rockets-core';
import { z } from 'zod';

/**
 * `POST /admin/invitations/revoke` body.
 *
 * `category` accepts any non-empty string: the SDK cannot know which
 * categories an application uses. For strict values, extend the schema in
 * your application and keep `withOpenApi` as the last call so the new
 * shape gets its own component id:
 *
 * @example
 * ```typescript
 * export const myInvitationRevokeSchema = withOpenApi(
 *   rocketsAuthInvitationRevokeSchema.extend({
 *     category: z.enum(['user', 'admin', 'organization']),
 *   }),
 *   'MyInvitationRevokeDto',
 * );
 * ```
 */
export const rocketsAuthInvitationRevokeSchema = withOpenApi(
  z.object({
    email: z.email().meta({
      description: 'Email address to revoke invitations for',
      example: 'user@example.com',
    }),
    category: z.string().min(1).meta({
      description:
        'Category of invitations to revoke (implementation-specific, e.g., "user", "admin")',
      example: 'user',
    }),
  }),
  'RocketsAuthInvitationRevokeDto',
);
