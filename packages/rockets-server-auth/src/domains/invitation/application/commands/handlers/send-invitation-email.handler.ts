import {
  CommandHandler,
  EventBus,
  ICommandHandler,
  QueryBus,
} from '@nestjs/cqrs';
import { Inject, Logger, type PlainLiteralObject } from '@nestjs/common';
import { EmailService } from '@concepta/nestjs-email';
import { GetUserQuery } from '@concepta/nestjs-user';
import { InvitationUserUndefinedException } from '@concepta/nestjs-invitation';
import {
  AuthenticationEmailException,
  NotificationSendFailedEvent,
} from '@concepta/nestjs-authentication';
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
 * Invitation mail leaves from a transaction commit hook, after the response
 * is built, so a failure can never reach the caller. Upstream's verify and
 * recovery ports hit the same wall in alpha.11 and answered it with
 * `NotificationSendFailedEvent`; invitations publish the same event rather
 * than inventing a second extension point, so an integrator subscribes once
 * with `@EventsHandler` and covers every notification this package sends.
 * The structured log stays — the event is for reacting, the log for
 * operators.
 */
function publishSendFailure(options: {
  eventBus: EventBus;
  logger: Logger;
  ctx: PlainLiteralObject;
  email: string | undefined;
  command: ConstructorParameters<typeof NotificationSendFailedEvent>[2];
  invitationId: string;
  userId: string;
  error: unknown;
  message: string;
}): void {
  const { eventBus, logger, ctx, email, command, error, message } = options;
  logger.error(message, {
    invitationId: options.invitationId,
    userId: options.userId,
    error: error instanceof Error ? error.message : String(error),
  });
  try {
    eventBus.publish(
      new NotificationSendFailedEvent(
        ctx,
        email ?? '',
        command,
        new AuthenticationEmailException({ originalError: error }),
      ),
    );
  } catch (publishError) {
    // A subscriber that throws must not take down the commit hook.
    logger.error('Failed to publish the notification-failure event', {
      invitationId: options.invitationId,
      error:
        publishError instanceof Error
          ? publishError.message
          : String(publishError),
    });
  }
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
    private readonly eventBus: EventBus,
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
    let email: string | undefined;
    try {
      email = await resolveUserEmail(
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
      publishSendFailure({
        eventBus: this.eventBus,
        logger: this.logger,
        ctx: command.ctx,
        email,
        command: SendInvitationEmailCommand,
        invitationId: invitation.id,
        userId: invitation.userId,
        error,
        message: 'Failed to send invitation email',
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
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: SendAcceptedEmailCommand): Promise<void> {
    const { invitation } = command;
    let email: string | undefined;
    try {
      email = await resolveUserEmail(
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
      publishSendFailure({
        eventBus: this.eventBus,
        logger: this.logger,
        ctx: command.ctx,
        email,
        command: SendAcceptedEmailCommand,
        invitationId: invitation.id,
        userId: invitation.userId,
        error,
        message: 'Failed to send invitation accepted email',
      });
    }
  }
}
