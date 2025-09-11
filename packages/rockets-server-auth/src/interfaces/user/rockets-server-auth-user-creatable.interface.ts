import { PasswordPlainInterface } from '@concepta/nestjs-common';
import { RocketsServerAuthUserInterface } from './rockets-server-auth-user.interface';

/**
 * Rockets Server User Creatable Interface
 */
export interface RocketsServerAuthUserCreatableInterface
  extends Pick<RocketsServerAuthUserInterface, 'username' | 'email'>,
    Partial<Pick<RocketsServerAuthUserInterface, 'active'>>,
    PasswordPlainInterface {}
