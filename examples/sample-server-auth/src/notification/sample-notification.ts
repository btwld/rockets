import { Logger, PlainLiteralObject } from '@nestjs/common';
import { Command, CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import type { ReferenceEmail } from '@concepta/nestjs-common';
import type {
  SendPasswordUpdatedNotificationCommandInterface,
  SendRecoverLoginNotificationCommandInterface,
  SendRecoverPasswordNotificationCommandInterface,
  SendVerifyNotificationCommandInterface,
} from '@concepta/nestjs-authentication';

/**
 * Sample notification Commands + Handlers wired into
 * `authentication.ports.{recoveryNotification,verifyNotification}` in
 * `app.module.ts`. They log instead of sending real email — production
 * consumers would replace these with handlers that use the configured
 * mailer service + their own email templates.
 *
 * RocketsAuthModule used to ship silent no-op defaults for these ports.
 * That hid broken recovery/verify flows, so the defaults were removed
 * and consumers must now provide explicit Command classes + handlers.
 */

const log = new Logger('SampleNotification');

export class SampleSendRecoverLoginCommand
  extends Command<void>
  implements SendRecoverLoginNotificationCommandInterface
{
  readonly ctx: PlainLiteralObject;
  readonly email: ReferenceEmail;
  readonly username: string;
  constructor(
    ctx: PlainLiteralObject,
    email: ReferenceEmail,
    username: string,
  ) {
    super();
    this.ctx = ctx;
    this.email = email;
    this.username = username;
  }
}

export class SampleSendRecoverPasswordCommand
  extends Command<void>
  implements SendRecoverPasswordNotificationCommandInterface
{
  readonly ctx: PlainLiteralObject;
  readonly email: ReferenceEmail;
  readonly passcode: string;
  readonly tokenExp: Date;
  constructor(
    ctx: PlainLiteralObject,
    email: ReferenceEmail,
    passcode: string,
    tokenExp: Date,
  ) {
    super();
    this.ctx = ctx;
    this.email = email;
    this.passcode = passcode;
    this.tokenExp = tokenExp;
  }
}

export class SampleSendPasswordUpdatedCommand
  extends Command<void>
  implements SendPasswordUpdatedNotificationCommandInterface
{
  readonly ctx: PlainLiteralObject;
  readonly email: ReferenceEmail;
  constructor(ctx: PlainLiteralObject, email: ReferenceEmail) {
    super();
    this.ctx = ctx;
    this.email = email;
  }
}

export class SampleSendVerifyCommand
  extends Command<void>
  implements SendVerifyNotificationCommandInterface
{
  readonly ctx: PlainLiteralObject;
  readonly email: ReferenceEmail;
  readonly passcode: string;
  readonly tokenExp: Date;
  constructor(
    ctx: PlainLiteralObject,
    email: ReferenceEmail,
    passcode: string,
    tokenExp: Date,
  ) {
    super();
    this.ctx = ctx;
    this.email = email;
    this.passcode = passcode;
    this.tokenExp = tokenExp;
  }
}

@CommandHandler(SampleSendRecoverLoginCommand)
export class SampleSendRecoverLoginHandler
  implements ICommandHandler<SampleSendRecoverLoginCommand, void>
{
  async execute(cmd: SampleSendRecoverLoginCommand): Promise<void> {
    log.log(`send recover-login to ${String(cmd.email)}`);
  }
}

@CommandHandler(SampleSendRecoverPasswordCommand)
export class SampleSendRecoverPasswordHandler
  implements ICommandHandler<SampleSendRecoverPasswordCommand, void>
{
  async execute(cmd: SampleSendRecoverPasswordCommand): Promise<void> {
    log.log(`send recover-password to ${String(cmd.email)}`);
  }
}

@CommandHandler(SampleSendPasswordUpdatedCommand)
export class SampleSendPasswordUpdatedHandler
  implements ICommandHandler<SampleSendPasswordUpdatedCommand, void>
{
  async execute(cmd: SampleSendPasswordUpdatedCommand): Promise<void> {
    log.log(`send password-updated to ${String(cmd.email)}`);
  }
}

@CommandHandler(SampleSendVerifyCommand)
export class SampleSendVerifyHandler
  implements ICommandHandler<SampleSendVerifyCommand, void>
{
  async execute(cmd: SampleSendVerifyCommand): Promise<void> {
    log.log(`send verify to ${String(cmd.email)}`);
  }
}

export const SAMPLE_NOTIFICATION_HANDLERS = [
  SampleSendRecoverLoginHandler,
  SampleSendRecoverPasswordHandler,
  SampleSendPasswordUpdatedHandler,
  SampleSendVerifyHandler,
];
