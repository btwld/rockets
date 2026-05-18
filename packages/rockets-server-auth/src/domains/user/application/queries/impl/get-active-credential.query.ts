import { PlainLiteralObject } from '@nestjs/common';

export class GetActiveCredentialQuery {
  constructor(
    public readonly userId: string,
    /** Repository context from the HTTP request (`PasswordPort` / CQRS commands). */
    public readonly ctx?: PlainLiteralObject,
  ) {}
}
