import { Injectable, Logger } from '@nestjs/common';

export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly body: string;
  readonly sentAt: Date;
}

/**
 * Stand-in for a real transactional-email provider (SendGrid, Postmark,
 * SES, …). Keeps every sent message in memory so the e2e suite can
 * assert on it without mocking the whole event bus.
 *
 * In production you would swap this class out — or, more realistically,
 * wrap it around the real provider while keeping the same interface so
 * unit tests still work.
 */
@Injectable()
export class FakeEmailGateway {
  private readonly logger = new Logger(FakeEmailGateway.name);
  private readonly sent: EmailMessage[] = [];

  async send(message: Omit<EmailMessage, 'sentAt'>): Promise<void> {
    const stamped: EmailMessage = { ...message, sentAt: new Date() };
    this.sent.push(stamped);
    this.logger.debug(
      `Email sent to ${stamped.to} subject="${stamped.subject}"`,
    );
  }

  /** Read-only snapshot for test assertions. */
  getSentMessages(): readonly EmailMessage[] {
    return [...this.sent];
  }

  /** For tests that need to isolate rounds. */
  reset(): void {
    this.sent.length = 0;
  }
}
