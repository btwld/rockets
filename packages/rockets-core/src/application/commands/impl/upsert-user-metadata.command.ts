import type { PlainLiteralObject } from '@nestjs/common';
import { UserMetadataUpdatableInterface } from '../../../domain/interfaces/user-metadata.interface';

export class UpsertUserMetadataCommand {
  /**
   * `ctx` is the request's app context (`getAppContext(req)`): every
   * repository call forwards it, so entity hooks run and the write joins
   * the surrounding transaction (AGENTS.md rule 16).
   */
  constructor(
    public readonly ctx: PlainLiteralObject,
    public readonly userId: string,
    public readonly data: UserMetadataUpdatableInterface,
  ) {}
}
