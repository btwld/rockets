import { CrudContextInterface } from '@concepta/nestjs-crud';
import { RocketsAuthUserEntityInterface } from '../../../interfaces/rockets-auth-user-entity.interface';

/**
 * Application-layer command for admin user deletion.
 *
 * Dispatched by CrudModule's CrudOperationResolver and handled by
 * AdminDeleteUserHandler which delegates to upstream RemoveUserCommand.
 */
export class AdminDeleteUserCommand {
  constructor(
    public readonly context: CrudContextInterface<RocketsAuthUserEntityInterface>,
  ) {}
}
