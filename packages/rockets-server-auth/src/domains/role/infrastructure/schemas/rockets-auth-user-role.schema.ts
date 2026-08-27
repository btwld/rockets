import { roleAssignmentSchema } from '@concepta/nestjs-role';
import { withOpenApi } from '@concepta/rockets-core';

/**
 * One row of `GET /admin/users/:userId/roles` (`RocketsAuthUserRoleDto`).
 * `.extend({})` clones the upstream schema so the component id never
 * touches upstream's `RoleAssignment`.
 */
export const rocketsAuthUserRoleSchema = withOpenApi(
  roleAssignmentSchema.extend({}),
  'RocketsAuthUserRoleDto',
);
