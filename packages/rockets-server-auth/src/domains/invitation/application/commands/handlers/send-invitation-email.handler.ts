import { CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs';
import { Inject, Logger, type PlainLiteralObject } from '@nestjs/common';
import { EmailService } from '@concepta/nestjs-email';
import { GetUserQuery } from '@concepta/nestjs-user';
import { InvitationUserUndefinedException } from '@concepta/nestjs-invitation';
import {
  SendInvitationEmailCommand,
  SendAcceptedEmailCommand,
} from '../impl/send-invitation-email.command';
import { ROCKETS_AUTH_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN } from '../../../../../shared/constants/rockets-auth.constants';
import type { RocketsAuthSettingsInterface } from '../../../../../shared/interfaces/rockets-auth-settings.interface';

async function resolveUserEmail(
  queryBus: QueryBus,
  ctx: PlainLiteralObject,
  userId: string,
): Promise<string> {
  const user = await queryBus.execute(new GetUserQuery(ctx, userId));
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
    // Reached from the invitation transaction's commit hook, after the
    // response is built, so nothing can be reported to the caller. Nest
    // CQRS's EventBus does catch what escapes here, but it logs only
    // `"InvitationDispatchedListener" has thrown an unhandled exception`
    // — no invitation, no recipient, and nothing subscribes to its
    // UnhandledExceptionBus. Own the failure instead, with the ids that
    // make it actionable. Covers the user lookup too: a failure there
    // loses the passcode exactly the same way.
    try {
      const email = await resolveUserEmail(
        this.queryBus,
        command.ctx,
        invitation.userId,
      );
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
    } catch (error) {
      this.logger.error('Failed to send invitation email', {
        invitationId: invitation.id,
        userId: invitation.userId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
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
    try {
      const email = await resolveUserEmail(
        this.queryBus,
        command.ctx,
        invitation.userId,
      );
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
    } catch (error) {
      // Courtesy notification on an already-committed acceptance: same
      // commit-hook path as the invitation email above.
      this.logger.error('Failed to send invitation accepted email', {
        invitationId: invitation.id,
        userId: invitation.userId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
