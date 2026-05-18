import { CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { EmailService } from '@concepta/nestjs-email';
import { GetUserQuery } from '@concepta/nestjs-user';
import { InvitationUserUndefinedException } from '@concepta/nestjs-invitation';
import {
  SendInvitationEmailCommand,
  SendAcceptedEmailCommand,
} from '../impl/send-invitation-email.command';
import { ROCKETS_AUTH_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN } from '../../../../../shared/constants/rockets-auth.constants';
import type { RocketsAuthSettingsInterface } from '../../../../../shared/interfaces/rockets-auth-settings.interface';

/**
 * Resolve the user's email from the invitation's userId.
 */
async function resolveUserEmail(
  queryBus: QueryBus,
  userId: string,
): Promise<string> {
  const user = await queryBus.execute(new GetUserQuery({}, userId));
  if (!user?.email) {
    throw new InvitationUserUndefinedException();
  }
  return user.email;
}

/**
 * Handles `SendInvitationEmailCommand` by delegating to the
 * Rockets-configured `EmailService`.
 *
 * v8 collapse: the upstream `SendInvitationNotificationCommandInterface`
 * no longer carries `from`, `baseUrl`, or `template` — those are read here
 * from `RocketsAuthSettingsInterface.email.{from, baseUrl, templates.invitation}`
 * via the settings token registered by the module-definition factory.
 */
@CommandHandler(SendInvitationEmailCommand)
export class SendInvitationEmailHandler
  implements ICommandHandler<SendInvitationEmailCommand>
{
  private readonly logger = new Logger(SendInvitationEmailHandler.name);

  constructor(
    private readonly emailService: EmailService,
    private readonly queryBus: QueryBus,
    @Inject(ROCKETS_AUTH_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN)
    private readonly settings: RocketsAuthSettingsInterface,
  ) {}

  async execute(command: SendInvitationEmailCommand): Promise<void> {
    const { invitation, passcode, tokenExp } = command;
    const email = await resolveUserEmail(this.queryBus, invitation.userId);
    const { from, baseUrl, templates } = this.settings.email;
    const template = templates.invitation;
    this.logger.debug(`Sending invitation email to ${email}`);
    await this.emailService.sendMail({
      to: email,
      from,
      subject: template.subject,
      template: template.fileName,
      context: {
        ...invitation,
        email,
        passcode,
        tokenExp,
        baseUrl,
        logo: template.logo,
      },
    });
  }
}

/**
 * Handles `SendAcceptedEmailCommand` by delegating to the
 * Rockets-configured `EmailService`. Reads `from` and `template` from
 * settings (see `SendInvitationEmailHandler` for the v8 rationale).
 */
@CommandHandler(SendAcceptedEmailCommand)
export class SendAcceptedEmailHandler
  implements ICommandHandler<SendAcceptedEmailCommand>
{
  private readonly logger = new Logger(SendAcceptedEmailHandler.name);

  constructor(
    private readonly emailService: EmailService,
    private readonly queryBus: QueryBus,
    @Inject(ROCKETS_AUTH_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN)
    private readonly settings: RocketsAuthSettingsInterface,
  ) {}

  async execute(command: SendAcceptedEmailCommand): Promise<void> {
    const { invitation } = command;
    const email = await resolveUserEmail(this.queryBus, invitation.userId);
    const { from, templates } = this.settings.email;
    const template = templates.invitationAccepted;
    this.logger.debug(`Sending accepted email to ${email}`);
    await this.emailService.sendMail({
      to: email,
      from,
      subject: template.subject,
      template: template.fileName,
      context: {
        ...invitation,
        email,
        logo: template.logo,
      },
    });
  }
}
