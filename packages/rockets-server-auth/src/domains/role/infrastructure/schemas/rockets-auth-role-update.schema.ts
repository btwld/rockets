import { roleSchema } from '@concepta/nestjs-role';
import { withOpenApi } from '@concepta/rockets-core';

export const rocketsAuthRoleUpdateSchema = withOpenApi(
  roleSchema.pick({ name: true, description: true }).partial(),
  'RocketsAuthRoleUpdateDto',
);
