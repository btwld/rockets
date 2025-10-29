import { 
  RocketsAuthUserEntityInterface,
  RocketsAuthUserInterface,
  RocketsAuthUserCreatableInterface,
  RocketsAuthUserUpdatableInterface 
} from '@bitwild/rockets-auth';

export interface UserEntityInterface extends RocketsAuthUserEntityInterface {
  age?: number;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  tags?: string[];
  isVerified?: boolean;
  lastLoginAt?: Date;
}

export interface UserInterface extends RocketsAuthUserInterface {
  age?: number;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  tags?: string[];
  isVerified?: boolean;
  lastLoginAt?: Date;
}

export interface UserCreatableInterface
  extends Pick<UserInterface, 'age' | 'firstName' | 'lastName'>,
    RocketsAuthUserCreatableInterface {}

export interface UserUpdatableInterface
  extends Partial<Pick<UserInterface, 'age' | 'firstName' | 'lastName'>>,
    RocketsAuthUserUpdatableInterface {}