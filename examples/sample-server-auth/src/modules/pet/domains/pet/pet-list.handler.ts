import { Injectable } from '@nestjs/common';
import {
  CrudAdapter,
  CrudListQuery,
  CrudResponsePaginatedInterface,
  InjectCrudAdapter,
} from '@bitwild/rockets-crud';
import { getActor } from '@bitwild/rockets-core';
// TODO: deep imports — move to barrel when @bitwild/rockets-crud exports these
import { CrudQueryHandler } from '@bitwild/rockets-crud/dist/application/queries/handlers/crud-query.handler';
import type { CrudQueryInterface } from '@bitwild/rockets-crud/dist/application/queries/interfaces/crud-query.interface';
import { WhereOperator, type EntityColumn } from '@bitwild/rockets-repository';
import { PetEntity } from './pet.entity';

/**
 * List handler: filters pets by the authenticated actor's id so users only
 * see pets they own. Role-based broadening (admins/managers seeing all
 * pets) is no longer enforced here — the v8 `Actor` overlay only carries
 * `{id, type}` and not roles. `AccessControlGuard` continues to gate the
 * route, so callers without the right grant never reach this handler.
 */
@Injectable()
export class PetListHandler extends CrudQueryHandler<PetEntity> {
  constructor(
    @InjectCrudAdapter(PetEntity)
    crudAdapter: CrudAdapter<PetEntity>,
  ) {
    super(crudAdapter);
  }

  async execute(
    query: CrudQueryInterface<PetEntity>,
  ): Promise<CrudResponsePaginatedInterface<PetEntity>> {
    const listQuery = query as CrudListQuery<PetEntity>;
    const actor = getActor(listQuery.context);
    if (!actor?.id) {
      return this.crudAdapter.list(listQuery.context);
    }

    // Mutate the existing context (an `AppContextHost` Proxy) so its
    // overlay accessors survive. Spreading into a new object would strip
    // them and the next `AppContextHost.from(...)` call inside the
    // repository adapter would throw
    // `Expected AppContextHost or nullish value, got object`.
    const ctx = listQuery.context;
    ctx.query.filter = [
      ...(ctx.query.filter ?? []),
      {
        field: 'userId' as EntityColumn<PetEntity>,
        operator: WhereOperator.EQ,
        value: actor.id,
      },
    ];
    return this.crudAdapter.list(ctx);
  }
}
