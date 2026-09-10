import { roleSchema } from '@concepta/nestjs-role';
import { withOpenApi } from '@concepta/rockets-core';

export const rocketsAuthRoleCreateSchema = withOpenApi(
  roleSchema.pick({ name: true, description: true }),
  'RocketsAuthRoleCreateDto',
);
