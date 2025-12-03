import { RocketsAuthUserCreatableInterface } from './rockets-auth-user-creatable.interface';

/**
 * Rockets Server User Updatable Interface
 *
 */
export interface RocketsAuthUserUpdatableInterface
  extends Partial<
    Pick<RocketsAuthUserCreatableInterface, 'active' | 'userMetadata'>
  > {}
