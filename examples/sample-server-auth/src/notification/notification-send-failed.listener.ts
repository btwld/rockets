import { Injectable, Logger } from '@nestjs/common';
import { EventsHandler, type IEventHandler } from '@nestjs/cqrs';
import { NotificationSendFailedEvent } from '@concepta/nestjs-authentication';

/**
 * What an app does with a notification it could not deliver.
 *
 * Verify, recovery and invitation mail are all dispatched
 * fire-and-forget — invitation mail leaves from a transaction commit hook,
 * after the response is already built — so a provider outage or a broken
 * template can never reach the caller. Branching on send success in the
 * route would also leak whether an address exists, so the port does not.
 *
 * `NotificationSendFailedEvent` is the seam that replaces that silence.
 * One `@EventsHandler` covers every notification the auth package sends;
 * a real app would page, retry with backoff, or write to a dead-letter
 * table here. The sample logs, loudly and with the ids that let an
 * operator find the account.
 */
@Injectable()
@EventsHandler(NotificationSendFailedEvent)
export class SampleNotificationSendFailedListener
  implements IEventHandler<NotificationSendFailedEvent>
{
  private readonly logger = new Logger(
    SampleNotificationSendFailedListener.name,
  );

  handle(event: NotificationSendFailedEvent): void {
    this.logger.error('Notification delivery failed', {
      // Which notification: the command class the port tried to dispatch.
      notification: event.command.name,
      recipient: event.email,
      errorCode: event.error.errorCode,
      reason: event.error.message,
    });
  }
}
