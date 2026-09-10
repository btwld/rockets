import { roleSchema } from '@concepta/nestjs-role';
import { withOpenApi } from '@concepta/rockets-core';

/**
 * `/admin/roles` response (`RocketsAuthRoleDto`). `.extend({})` clones the
 * upstream schema so the new component id never touches upstream's `Role`.
 */
export const rocketsAuthRoleSchema = withOpenApi(
  roleSchema.extend({}),
  'RocketsAuthRoleDto',
);
