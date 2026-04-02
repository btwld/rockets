import { RocketsAuthUserEntityInterface } from '../../../interfaces/rockets-auth-user-entity.interface';
import { RocketsAuthUserCreatableInterface } from '../../../interfaces/rockets-auth-user-creatable.interface';
import { CrudCreateCommand } from '@concepta/nestjs-crud';

export class SignupUserCommand extends CrudCreateCommand<
  RocketsAuthUserEntityInterface,
  RocketsAuthUserCreatableInterface
> {}
