import { RoleCreatableInterface } from '@concepta/nestjs-role';

/**
 * Rockets Auth Role Creatable Interface
 *
 * Currently extends RoleCreatableInterface without additions.
 * This serves as a namespace extension point for future auth-specific role creation fields.
 *
 */
export interface RocketsAuthRoleCreatableInterface
  extends RoleCreatableInterface {}
