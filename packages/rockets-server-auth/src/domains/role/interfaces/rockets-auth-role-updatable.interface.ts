import { RocketsAuthRoleCreatableInterface } from './rockets-auth-role-creatable.interface';

/**
 * Rockets Server Role Updatable Interface
 *
 * Combines required id field with optional updatable fields
 */
export interface RocketsAuthRoleUpdatableInterface
  extends Partial<
    Pick<RocketsAuthRoleCreatableInterface, 'name' | 'description'>
  > {}
