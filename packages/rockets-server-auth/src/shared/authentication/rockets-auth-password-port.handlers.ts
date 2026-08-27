import { AppContextHost, TransactionScope } from '@concepta/rockets-core';
import {
  CommandBus,
  CommandHandler,
  EventPublisher,
  type ICommandHandler,
  QueryBus,
} from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import {
  UserCredentials,
  UserPasswordHistoryViolationException,
  UserPasswordPort,
  type UserCredentialEntityInterface,
  type UserCredentialsRepositoryInterface,
  type UserSettingsInterface,
} from '@concepta/nestjs-user';
import { ValidateCurrentPasswordCommand } from '@concepta/nestjs-password';
import { EventContextHost } from '@concepta/nestjs-core';

import { GetActiveCredentialQuery } from '../../domains/user/application/queries/impl/get-active-credential.query';
import {
  RocketsAuthSetPasswordPortCommand,
  RocketsAuthValidatePasswordPortCommand,
} from './rockets-auth-password-port.commands';

// Upstream exposes these types but not their DI tokens. Keep the compatibility
// strings isolated until @concepta/nestjs-user exports the constants.
const USER_CREDENTIALS_REPOSITORY_TOKEN = 'USER_CREDENTIALS_REPOSITORY_TOKEN';
const USER_MODULE_SETTINGS_TOKEN = 'USER_MODULE_SETTINGS_TOKEN';

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
        new GetActiveCredentialQuery(command.ctx, userId),
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
  constructor(
    @Inject(USER_CREDENTIALS_REPOSITORY_TOKEN)
    private readonly credentialsRepository: UserCredentialsRepositoryInterface,
    @Inject(USER_MODULE_SETTINGS_TOKEN)
    private readonly userSettings: UserSettingsInterface,
    @Inject(UserPasswordPort)
    private readonly passwordPort: UserPasswordPort,
    private readonly txScope: TransactionScope,
    private readonly eventPublisher: EventPublisher,
  ) {}

  async execute(command: RocketsAuthSetPasswordPortCommand): Promise<void> {
    const ctx = AppContextHost.from(command.ctx);

    await this.txScope.run(ctx, async (txCtx) => {
      const eventContext = new EventContextHost({}, {});
      const active = await this.credentialsRepository.findActiveByUserId(
        txCtx,
        command.assigneeId,
      );

      const reuseAfterDays = this.userSettings.password?.reuseAfterDays;
      if (reuseAfterDays !== undefined && reuseAfterDays > 0) {
        const limitDate = new Date(
          Date.now() - reuseAfterDays * 24 * 60 * 60 * 1000,
        );
        const history = await this.credentialsRepository.findByUserId(
          txCtx,
          command.assigneeId,
          limitDate,
        );
        const valid = await this.passwordPort.validateHistory(
          command.password,
          history,
        );
        if (!valid) {
          throw new UserPasswordHistoryViolationException();
        }
      }

      const passwordStorage = await this.passwordPort.create(command.password);

      if (active) {
        const previous = this.eventPublisher.mergeObjectContext(active);
        previous.deactivate(eventContext);
        await this.credentialsRepository.save(txCtx, previous);
        txCtx.trx.onCommit(() => previous.commit());
        txCtx.trx.onRollback(() => previous.uncommit());
      }

      const next = this.eventPublisher.mergeObjectContext(
        UserCredentials.create(eventContext, {
          userId: command.assigneeId,
          passwordHash: passwordStorage.passwordHash,
        }),
      );
      await this.credentialsRepository.save(txCtx, next);
      txCtx.trx.onCommit(() => next.commit());
      txCtx.trx.onRollback(() => next.uncommit());
    });
  }
}
