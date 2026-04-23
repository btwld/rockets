import { PlainLiteralObject } from '@nestjs/common';
import {
  SendInvitationEmailCommandInterface,
  SendAcceptedEmailCommandInterface,
} from '@concepta/nestjs-invitation';
import type { InvitationEventPayloadInterface } from '@concepta/nestjs-invitation';
import type { InvitationEmailTemplateSettings } from '@concepta/nestjs-invitation';

/**
 * Command to send an invitation email to a user.
 *
 * Implements the `SendInvitationEmailCommandInterface` required by
 * `InvitationEmailPort` so it can be passed as `ports.email.sendInvitationCommand`.
 */
export class SendInvitationEmailCommand
  implements SendInvitationEmailCommandInterface
{
  readonly ctx: PlainLiteralObject;
  readonly invitation: InvitationEventPayloadInterface;
  readonly passcode: string;
  readonly tokenExp: Date;
  readonly from: string;
  readonly baseUrl: string;
  readonly template: InvitationEmailTemplateSettings;

  constructor(params: SendInvitationEmailCommand) {
    this.ctx = params.ctx;
    this.invitation = params.invitation;
    this.passcode = params.passcode;
    this.tokenExp = params.tokenExp;
    this.from = params.from;
    this.baseUrl = params.baseUrl;
    this.template = params.template;
  }
}

/**
 * Command to send an "invitation accepted" confirmation email.
 *
 * Implements the `SendAcceptedEmailCommandInterface` required by
 * `InvitationEmailPort` so it can be passed as `ports.email.sendAcceptedCommand`.
 */
export class SendAcceptedEmailCommand
  implements SendAcceptedEmailCommandInterface
{
  readonly ctx: PlainLiteralObject;
  readonly invitation: InvitationEventPayloadInterface;
  readonly from: string;
  readonly template: InvitationEmailTemplateSettings;

  constructor(params: SendAcceptedEmailCommand) {
    this.ctx = params.ctx;
    this.invitation = params.invitation;
    this.from = params.from;
    this.template = params.template;
  }
}
