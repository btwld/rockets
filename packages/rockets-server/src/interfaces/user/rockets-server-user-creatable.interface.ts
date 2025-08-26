import { PasswordPlainInterface } from '@concepta/nestjs-common';
import { RocketsServerUserInterface } from './rockets-server-user.interface';

/**
 * Rockets Server User Creatable Interface
 */
export interface RocketsServerUserCreatableInterface
  extends Pick<RocketsServerUserInterface, 'username' | 'email'>,
    Partial<Pick<RocketsServerUserInterface, 'active'>>,
    PasswordPlainInterface {}
