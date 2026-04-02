import { Injectable } from '@nestjs/common';
import type { CrudCommandHandlerInterface } from '@concepta/nestjs-crud/dist/application/commands/interfaces/crud-command-handler.interface';
import type { CrudCommandInterface } from '@concepta/nestjs-crud/dist/application/commands/interfaces/crud-command.interface';
import { RocketsAuthUserEntityInterface } from '../../../interfaces/rockets-auth-user-entity.interface';

/**
 * Abstract base class for admin user delete command handlers.
 *
 * CrudModule dispatches CrudDeleteCommand via the adapter resolver.
 * Extend this class and register via
 * `RocketsAuthModule.forRoot({ userCrud: { handlers: { adminDelete } } })`.
 */
@Injectable()
export abstract class AbstractAdminDeleteUserHandler
  implements CrudCommandHandlerInterface<RocketsAuthUserEntityInterface>
{
  abstract execute(
    command: CrudCommandInterface<RocketsAuthUserEntityInterface>,
  ): Promise<RocketsAuthUserEntityInterface | null>;
}
