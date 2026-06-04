import { Injectable } from '@nestjs/common';
import { CrudDeleteCommand } from '@bitwild/rockets-crud';

import { RocketsAuthUserEntityInterface } from '../../../interfaces/rockets-auth-user-entity.interface';

/**
 * Abstract base class for admin user delete command handlers.
 *
 * CrudModule dispatches `CrudDeleteCommand` via the adapter resolver.
 * Extend this class and register via
 * `RocketsAuthModule.forRoot({ userCrud: { handlers: { adminDelete } } })`.
 */
@Injectable()
export abstract class AbstractAdminDeleteUserHandler {
  abstract execute(
    command: CrudDeleteCommand<RocketsAuthUserEntityInterface>,
  ): Promise<RocketsAuthUserEntityInterface | null>;
}
