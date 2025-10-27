import { PasswordPlainInterface } from '@concepta/nestjs-common';
import { RocketsAuthUserInterface } from './rockets-auth-user.interface';

/**
 * Rockets Server User Creatable Interface
 */
export interface RocketsAuthUserCreatableInterface
  extends Pick<RocketsAuthUserInterface, 'username' | 'email'>,
    Partial<Pick<RocketsAuthUserInterface, 'active' | 'userMetadata'>>,
    PasswordPlainInterface {}
