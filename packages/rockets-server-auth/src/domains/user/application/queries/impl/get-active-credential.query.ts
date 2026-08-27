import type { PlainLiteralObject } from '@nestjs/common';

export class GetActiveCredentialQuery {
  constructor(
    /** Repository context of the surrounding operation — forwarded as-is. */
    public readonly ctx: PlainLiteralObject,
    public readonly userId: string,
  ) {}
}
