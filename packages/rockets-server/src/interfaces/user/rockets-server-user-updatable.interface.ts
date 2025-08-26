import { RocketsServerUserCreatableInterface } from './rockets-server-user-creatable.interface';
import { RocketsServerUserInterface } from './rockets-server-user.interface';

/**
 * Rockets Server User Updatable Interface
 *
 */
export interface RocketsServerUserUpdatableInterface
  extends Pick<RocketsServerUserInterface, 'id'>,
    Partial<
      Pick<RocketsServerUserCreatableInterface, 'email' | 'username' | 'active'>
    > {
  firstName?: string;
}
