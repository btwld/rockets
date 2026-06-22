import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  Logger,
  PlainLiteralObject,
  UnauthorizedException,
} from '@nestjs/common';
import {
  UpdateUserPasswordCommand,
  UserPasswordCurrentInvalidException,
} from '@concepta/nestjs-user';

import { resolveBitwildAppContext } from '../../../../../shared/compatibility/resolve-bitwild-app-context';
import { ChangeMyPasswordCommand } from '../impl/change-my-password.command';

export interface ChangeMyPasswordPayload {
  current: string;
  next: string;
}

/**
 * Template-method handler for `ChangeMyPasswordCommand`.
 *
 * Subclass and override only the step you need:
 *  - `authorize`   — extra checks before the use case runs
 *  - `validate`    — sanitise / shape the password payload
 *  - `persist`     — replace the password write (e.g. mirror to legacy store)
 *  - `afterChange` — side effects (audit log, push notification, etc.)
 *  - `mapError`    — translate upstream exceptions to HTTP responses
 *
 * Register the subclass via
 * `{ provide: ChangeMyPasswordHandler, useClass: MyChangeMyPasswordHandler }`.
 */
@CommandHandler(ChangeMyPasswordCommand)
export abstract class AbstractChangeMyPasswordHandler
  implements ICommandHandler<ChangeMyPasswordCommand, void>
{
  protected readonly logger = new Logger(this.constructor.name);

  constructor(protected readonly commandBus: CommandBus) {}

  async execute(command: ChangeMyPasswordCommand): Promise<void> {
    const { ctx, userId } = command;

    await this.authorize(ctx, userId);
    const payload = await this.validate(ctx, command);

    try {
      await this.persist(ctx, userId, payload);
      await this.afterChange(ctx, userId);
      this.logger.log('Password changed successfully', { userId });
    } catch (error) {
      this.mapError(error, userId);
    }
  }

  protected async authorize(
    _ctx: PlainLiteralObject,
    _userId: string,
  ): Promise<void> {}

  protected async validate(
    _ctx: PlainLiteralObject,
    command: ChangeMyPasswordCommand,
  ): Promise<ChangeMyPasswordPayload> {
    return { current: command.currentPassword, next: command.newPassword };
  }

  protected async persist(
    ctx: PlainLiteralObject,
    userId: string,
    payload: ChangeMyPasswordPayload,
  ): Promise<void> {
    await this.commandBus.execute(
      new UpdateUserPasswordCommand(resolveBitwildAppContext(ctx), userId, {
        password: payload.next,
        passwordCurrent: payload.current,
      }),
    );
  }

  protected async afterChange(
    _ctx: PlainLiteralObject,
    _userId: string,
  ): Promise<void> {}

  protected mapError(error: unknown, userId: string): never {
    if (error instanceof UnauthorizedException) {
      throw error;
    }
    if (error instanceof UserPasswordCurrentInvalidException) {
      throw new UnauthorizedException();
    }
    this.logger.error('Failed to change password', {
      userId,
      errorId: 'PASSWORD_CHANGE_FAILED',
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
