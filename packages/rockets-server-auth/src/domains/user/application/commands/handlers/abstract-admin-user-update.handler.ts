import { Injectable } from '@nestjs/common';
import { CrudUpdateCommand } from '@bitwild/rockets-crud';

import { RocketsAuthUserEntityInterface } from '../../../interfaces/rockets-auth-user-entity.interface';
import { RocketsAuthUserUpdatableInterface } from '../../../interfaces/rockets-auth-user-updatable.interface';

/**
 * Abstract base class for admin user update command handlers.
 *
 * CrudModule dispatches `CrudUpdateCommand` via the adapter resolver.
 * Extend this class and register via
 * `RocketsAuthModule.forRoot({ userCrud: { handlers: { adminUpdate } } })`.
 */
@Injectable()
export abstract class AbstractAdminUserUpdateHandler {
  abstract execute(
    command: CrudUpdateCommand<
      RocketsAuthUserEntityInterface,
      RocketsAuthUserUpdatableInterface
    >,
  ): Promise<RocketsAuthUserEntityInterface>;
}
