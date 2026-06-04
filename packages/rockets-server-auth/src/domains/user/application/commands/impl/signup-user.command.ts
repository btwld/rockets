import { RocketsAuthUserEntityInterface } from '../../../interfaces/rockets-auth-user-entity.interface';
import { RocketsAuthUserCreatableInterface } from '../../../interfaces/rockets-auth-user-creatable.interface';
import { CrudCreateCommand } from '@bitwild/rockets-crud';

export class SignupUserCommand extends CrudCreateCommand<
  RocketsAuthUserEntityInterface,
  RocketsAuthUserCreatableInterface
> {}
