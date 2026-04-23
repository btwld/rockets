import { CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { EmailService } from '@concepta/nestjs-email';
import { GetUserQuery } from '@concepta/nestjs-user';
import { InvitationUserUndefinedException } from '@concepta/nestjs-invitation';
import {
  SendInvitationEmailCommand,
  SendAcceptedEmailCommand,
} from '../impl/send-invitation-email.command';

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
 */
@CommandHandler(SendInvitationEmailCommand)
export class SendInvitationEmailHandler
  implements ICommandHandler<SendInvitationEmailCommand>
{
  private readonly logger = new Logger(SendInvitationEmailHandler.name);

  constructor(
    private readonly emailService: EmailService,
    private readonly queryBus: QueryBus,
  ) {}

  async execute(command: SendInvitationEmailCommand): Promise<void> {
    const { invitation, passcode, tokenExp, from, baseUrl, template } = command;
    const email = await resolveUserEmail(this.queryBus, invitation.userId);
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
 * Rockets-configured `EmailService`.
 */
@CommandHandler(SendAcceptedEmailCommand)
export class SendAcceptedEmailHandler
  implements ICommandHandler<SendAcceptedEmailCommand>
{
  private readonly logger = new Logger(SendAcceptedEmailHandler.name);

  constructor(
    private readonly emailService: EmailService,
    private readonly queryBus: QueryBus,
  ) {}

  async execute(command: SendAcceptedEmailCommand): Promise<void> {
    const { invitation, from, template } = command;
    const email = await resolveUserEmail(this.queryBus, invitation.userId);
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
