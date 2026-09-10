/**
  Minimal email send contract used by rockets-auth notification services.
  Owned here because the email package stays on v7 until Concepta publishes
  a v8 email surface, and `@concepta/nestjs-common` is no longer a dependency.
 */
type EmailAddress =
  | string
  | { readonly name: string; readonly address: string };
type EmailRecipient = EmailAddress | EmailAddress[];

export interface EmailSendOptionsInterface {
  readonly to?: EmailRecipient;
  readonly cc?: EmailRecipient;
  readonly bcc?: EmailRecipient;
  readonly from?: EmailAddress;
  readonly replyTo?: EmailAddress;
  readonly context?: Record<string, unknown>;
  readonly subject?: string;
  readonly template?: string;
}

export interface EmailSendInterface {
  sendMail(sendMailOptions: EmailSendOptionsInterface): Promise<void>;
}
