import { Injectable, type PlainLiteralObject } from '@nestjs/common';
import { CrudAdapter, CrudCommandHandlerBase } from '@bitwild/rockets-crud';
import { PetEntity } from './pet.schema';
import { InjectCrudAdapter } from '@bitwild/rockets-common';

/**
 * Optional custom create handler — the stock `CrudCommandHandler` path
 * is enough when {@link PetUniqueRefHook} owns pre-insert validation.
 *
 * Wire `handler: PetCreateHandler` on `create` only when you need extra
 * command-bus logic beyond repository hooks.
 */
@Injectable()
export class PetCreateHandler extends CrudCommandHandlerBase<PlainLiteralObject> {
  constructor(
    @InjectCrudAdapter(PetEntity)
    readonly crudAdapter: CrudAdapter<PlainLiteralObject>,
  ) {
    super(crudAdapter);
  }
}
