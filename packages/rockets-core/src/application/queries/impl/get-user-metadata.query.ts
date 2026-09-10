import type { PlainLiteralObject } from '@nestjs/common';

export class GetUserMetadataQuery {
  /** `ctx` is the request's app context — forwarded to the repository. */
  constructor(
    public readonly ctx: PlainLiteralObject,
    public readonly userId: string,
  ) {}
}
