import { RocketsAuthRoleCreatableInterface } from './rockets-auth-role-creatable.interface';
import { RocketsAuthRoleInterface } from './rockets-auth-role.interface';

/**
 * Rockets Server Role Updatable Interface
 *
 * Combines required id field with optional updatable fields
 */
export interface RocketsAuthRoleUpdatableInterface
  extends Partial<
    Pick<RocketsAuthRoleInterface, 'id'> &
      Pick<RocketsAuthRoleCreatableInterface, 'name' | 'description'>
  > {}
