import { CrudContextInterface } from '@concepta/nestjs-crud';
import { RocketsAuthUserEntityInterface } from '../../../interfaces/rockets-auth-user-entity.interface';
import { RocketsAuthUserUpdatableInterface } from '../../../interfaces/rockets-auth-user-updatable.interface';

/**
 * Application-layer command for admin user updates.
 *
 * Dispatched by the gateway AdminUpdateRequestHandler and handled by
 * AdminUpdateUserHandler which owns the actual update + metadata logic.
 */
export class AdminUpdateUserCommand {
  constructor(
    public readonly context: CrudContextInterface<RocketsAuthUserEntityInterface>,
    public readonly dto: RocketsAuthUserUpdatableInterface,
  ) {}
}
