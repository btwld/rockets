import { PlainLiteralObject } from '@nestjs/common';
import { Command } from '@nestjs/cqrs';
import {
  SendInvitationNotificationCommandInterface,
  SendAcceptedNotificationCommandInterface,
} from '@concepta/nestjs-invitation';
import type { InvitationEventPayloadInterface } from '@concepta/nestjs-invitation';

/**
 * Command to send an invitation email to a user.
 *
 * Implements the v8 `SendInvitationNotificationCommandInterface` required by
 * `InvitationNotificationPort` so it can be passed as
 * `ports.notification.sendInvitationCommand`.
 *
 * v8 simplification: the upstream interface no longer carries `from`,
 * `baseUrl`, or `template` — those resolve inside the handler from
 * `RocketsAuthSettingsInterface.email`.
 */
export class SendInvitationEmailCommand
  extends Command<void>
  implements SendInvitationNotificationCommandInterface
{
  readonly ctx: PlainLiteralObject;
  readonly invitation: InvitationEventPayloadInterface;
  readonly passcode: string;
  readonly tokenExp: Date;

  constructor(params: {
    ctx: PlainLiteralObject;
    invitation: InvitationEventPayloadInterface;
    passcode: string;
    tokenExp: Date;
  }) {
    super();
    this.ctx = params.ctx;
    this.invitation = params.invitation;
    this.passcode = params.passcode;
    this.tokenExp = params.tokenExp;
  }
}

/**
 * Command to send an "invitation accepted" confirmation email.
 *
 * Implements the v8 `SendAcceptedNotificationCommandInterface` required by
 * `InvitationNotificationPort` so it can be passed as
 * `ports.notification.sendAcceptedCommand`.
 */
export class SendAcceptedEmailCommand
  extends Command<void>
  implements SendAcceptedNotificationCommandInterface
{
  readonly ctx: PlainLiteralObject;
  readonly invitation: InvitationEventPayloadInterface;

  constructor(params: {
    ctx: PlainLiteralObject;
    invitation: InvitationEventPayloadInterface;
  }) {
    super();
    this.ctx = params.ctx;
    this.invitation = params.invitation;
  }
}
