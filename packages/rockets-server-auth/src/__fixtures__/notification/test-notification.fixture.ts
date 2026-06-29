import { PlainLiteralObject, Logger } from '@nestjs/common';
import { Command, CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import type { ReferenceEmail } from '@concepta/nestjs-core';
import type {
  SendPasswordUpdatedNotificationCommandInterface,
  SendRecoverLoginNotificationCommandInterface,
  SendRecoverPasswordNotificationCommandInterface,
} from '@concepta/nestjs-authentication';
import type { SendVerifyNotificationCommandInterface } from '@concepta/nestjs-authentication';

/**
 * Test stub Command classes + handlers for the authentication notification
 * ports. Production rockets-auth no longer ships silent no-ops, so each
 * e2e app must register real (or fake) handlers itself. These log instead
 * of emailing so test assertions can read them off the logger spy.
 */

const log = new Logger('E2eNotificationStub');

export class E2eSendRecoverLoginNotificationCommand
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

export class E2eSendRecoverPasswordNotificationCommand
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

export class E2eSendPasswordUpdatedNotificationCommand
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

export class E2eSendVerifyNotificationCommand
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

@CommandHandler(E2eSendRecoverLoginNotificationCommand)
export class E2eSendRecoverLoginNotificationHandler
  implements ICommandHandler<E2eSendRecoverLoginNotificationCommand, void>
{
  async execute(cmd: E2eSendRecoverLoginNotificationCommand): Promise<void> {
    log.log(`[stub] send recover-login to ${String(cmd.email)}`);
  }
}

@CommandHandler(E2eSendRecoverPasswordNotificationCommand)
export class E2eSendRecoverPasswordNotificationHandler
  implements ICommandHandler<E2eSendRecoverPasswordNotificationCommand, void>
{
  async execute(cmd: E2eSendRecoverPasswordNotificationCommand): Promise<void> {
    log.log(`[stub] send recover-password to ${String(cmd.email)}`);
  }
}

@CommandHandler(E2eSendPasswordUpdatedNotificationCommand)
export class E2eSendPasswordUpdatedNotificationHandler
  implements ICommandHandler<E2eSendPasswordUpdatedNotificationCommand, void>
{
  async execute(cmd: E2eSendPasswordUpdatedNotificationCommand): Promise<void> {
    log.log(`[stub] send password-updated to ${String(cmd.email)}`);
  }
}

@CommandHandler(E2eSendVerifyNotificationCommand)
export class E2eSendVerifyNotificationHandler
  implements ICommandHandler<E2eSendVerifyNotificationCommand, void>
{
  async execute(cmd: E2eSendVerifyNotificationCommand): Promise<void> {
    log.log(`[stub] send verify to ${String(cmd.email)}`);
  }
}

export const E2E_NOTIFICATION_HANDLERS = [
  E2eSendRecoverLoginNotificationHandler,
  E2eSendRecoverPasswordNotificationHandler,
  E2eSendPasswordUpdatedNotificationHandler,
  E2eSendVerifyNotificationHandler,
];
