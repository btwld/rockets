import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { SignupUserCommand } from '../impl/signup-user.command';
import { RocketsAuthUserEntityInterface } from '../../../interfaces/rockets-auth-user-entity.interface';

/**
 * Abstract base class for signup command handlers.
 *
 * Carries `@CommandHandler(SignupUserCommand)` so subclasses inherit
 * the CQRS metadata via the prototype chain — no decorator needed
 * on the concrete class.
 *
 * To customise signup logic, extend this class and register the
 * subclass via `RocketsAuthModule.forRoot({ userCrud: { signupHandler } })`.
 */
@CommandHandler(SignupUserCommand)
export abstract class AbstractSignupUserHandler
  implements ICommandHandler<SignupUserCommand, RocketsAuthUserEntityInterface>
{
  abstract execute(
    command: SignupUserCommand,
  ): Promise<RocketsAuthUserEntityInterface>;
}
