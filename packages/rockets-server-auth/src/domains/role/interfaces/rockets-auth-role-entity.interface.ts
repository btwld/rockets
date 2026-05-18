import { RoleEntityInterface } from '@concepta/nestjs-role';
import { RocketsAuthRoleInterface } from './rockets-auth-role.interface';

/**
 * Rockets Auth Role Entity Interface
 *
 * Currently extends RoleEntityInterface and RocketsAuthRoleInterface without additions.
 * This serves as a namespace extension point for future auth-specific role entity fields.
 *
 */
export interface RocketsAuthRoleEntityInterface
  extends RoleEntityInterface,
    RocketsAuthRoleInterface {}
