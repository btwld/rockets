import { withOpenApi } from '@concepta/rockets-core';
import { z } from 'zod';

/** `POST /admin/users/:userId/roles` body. */
export const rocketsAuthAdminAssignUserRoleSchema = withOpenApi(
  z.object({
    roleId: z.string().min(1).meta({
      description: 'Role ID to assign to the user',
      example: '08a82592-714e-4da0-ace5-45ed3b4eb795',
    }),
  }),
  'AdminAssignUserRoleDto',
);
