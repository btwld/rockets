import { Injectable, Logger, type PlainLiteralObject } from '@nestjs/common';
import {
  CrudAdapter,
  CrudCreateCommand,
  CrudCreateHandler,
} from '@concepta/nestjs-crud';
import { PetEntity } from './pet.schema';
import { InjectCrudAdapter } from '@bitwild/rockets-core';

/**
 * Reference: a custom create command handler on a **zod** resource
 * (wired via `operations.create.handler` in pet.resource.ts).
 *
 * It extends the stock {@link CrudCreateHandler} and delegates with
 * `super.execute(command)` — the `execute` override is the seam where you'd
 * add command-bus logic that doesn't fit a repository hook. Pre-insert
 * validation still lives in {@link PetUniqueRefHook} and post-write effects
 * in {@link PetCreatedEventHook}; this handler just proves the seam runs.
 */
@Injectable()
export class PetCreateHandler extends CrudCreateHandler<PlainLiteralObject> {
  private readonly logger = new Logger(PetCreateHandler.name);

  constructor(
    @InjectCrudAdapter(PetEntity)
    readonly crudAdapter: CrudAdapter<PlainLiteralObject>,
  ) {
    super(crudAdapter);
  }

  async execute(
    command: CrudCreateCommand<PlainLiteralObject>,
  ): Promise<PlainLiteralObject> {
    this.logger.debug('Custom PetCreateHandler create seam');
    return super.execute(command);
  }
}
