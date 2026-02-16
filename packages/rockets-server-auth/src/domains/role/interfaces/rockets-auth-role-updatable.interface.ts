import { RocketsAuthRoleCreatableInterface } from './rockets-auth-role-creatable.interface';

/**
 * Rockets Server Role Updatable Interface
 *
 * Optional updatable fields for role (name and description)
 */
export interface RocketsAuthRoleUpdatableInterface
  extends Partial<
    Pick<RocketsAuthRoleCreatableInterface, 'name' | 'description'>
  > {}
