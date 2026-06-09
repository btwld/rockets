import {
  CommandBus,
  CommandHandler,
  ICommandHandler,
  QueryBus,
} from '@nestjs/cqrs';
import type { UserCredentialEntityInterface } from '@concepta/nestjs-user';
import { ValidateCurrentPasswordCommand } from '@concepta/nestjs-password';
import { UpdateUserPasswordCommand } from '@concepta/nestjs-user';

import { GetActiveCredentialQuery } from '../../domains/user/application/queries/impl/get-active-credential.query';
import { resolveBitwildAppContext } from '../compatibility/resolve-bitwild-app-context';
import {
  RocketsAuthSetPasswordPortCommand,
  RocketsAuthValidatePasswordPortCommand,
} from './rockets-auth-password-port.commands';

/**
 * Dispatches upstream password validation with the constructor shape {@link PasswordPort} uses.
 *
 * {@link PasswordPort} passes the **user** aggregate from local login; the password
 * hash lives on the credentials row. Resolve active credentials via
 * {@link GetActiveCredentialQuery} before delegating to {@link ValidateCurrentPasswordCommand}.
 */
@CommandHandler(RocketsAuthValidatePasswordPortCommand)
export class RocketsAuthValidatePasswordPortHandler
  implements ICommandHandler<RocketsAuthValidatePasswordPortCommand, boolean>
{
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  async execute(
    command: RocketsAuthValidatePasswordPortCommand,
  ): Promise<boolean> {
    const userId = command.target.id;
    const credential: UserCredentialEntityInterface | null =
      await this.queryBus.execute(
        new GetActiveCredentialQuery(userId, command.ctx),
      );

    if (!credential) {
      return false;
    }

    return this.commandBus.execute(
      new ValidateCurrentPasswordCommand(command.password, credential),
    );
  }
}

/**
 * Sets password for recovery / flows that call {@link PasswordPort#setPassword}
 * using plain text (hashed inside user credentials pipeline).
 */
@CommandHandler(RocketsAuthSetPasswordPortCommand)
export class RocketsAuthSetPasswordPortHandler
  implements ICommandHandler<RocketsAuthSetPasswordPortCommand, void>
{
  constructor(private readonly commandBus: CommandBus) {}

  async execute(command: RocketsAuthSetPasswordPortCommand): Promise<void> {
    await this.commandBus.execute(
      new UpdateUserPasswordCommand(
        resolveBitwildAppContext(command.ctx),
        command.assigneeId,
        {
          password: command.password,
        },
      ),
    );
  }
}
