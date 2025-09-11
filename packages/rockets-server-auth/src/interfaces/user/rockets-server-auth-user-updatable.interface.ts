import { RocketsServerAuthUserCreatableInterface } from './rockets-server-auth-user-creatable.interface';
import { RocketsServerAuthUserInterface } from './rockets-server-auth-user.interface';

/**
 * Rockets Server User Updatable Interface
 *
 */
export interface RocketsServerAuthUserUpdatableInterface
  extends Pick<RocketsServerAuthUserInterface, 'id'>,
    Partial<
      Pick<RocketsServerAuthUserCreatableInterface, 'email' | 'username' | 'active'>
    > {}
