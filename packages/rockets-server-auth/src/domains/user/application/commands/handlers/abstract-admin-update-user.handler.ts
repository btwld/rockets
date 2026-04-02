import { CommandHandler } from '@nestjs/cqrs';
import { UpdateUserCommand } from '@concepta/nestjs-user';
import { RocketsAuthUserInterface } from '../../../interfaces/rockets-auth-user.interface';

/**
 * Abstract base class for admin update command handlers.
 *
 * CrudModule dynamically applies `@CommandHandler(CrudUpdateCommand)` via
 * CrudCqrsResolver.decorateCommandHandler — no manual decorator needed.
 *
 * To customise admin update logic, extend this class and register the
 * subclass via `RocketsAuthModule.forRoot({ userCrud: { handlers: { adminUpdate } } })`.
 */
@CommandHandler(UpdateUserCommand)
export abstract class AbstractUpdateUserHandler {
  abstract execute(
    command: UpdateUserCommand,
  ): Promise<RocketsAuthUserInterface>;
}
