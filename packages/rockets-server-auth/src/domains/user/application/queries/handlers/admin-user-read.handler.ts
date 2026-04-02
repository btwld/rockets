import { Injectable, PlainLiteralObject } from '@nestjs/common';
import {
  CrudAdapter,
  CrudResponsePaginatedInterface,
  InjectCrudAdapter,
} from '@concepta/nestjs-crud';
import type { CrudQueryInterface } from '@concepta/nestjs-crud/dist/application/queries/interfaces/crud-query.interface';
import { USER_CRUD_ENTITY_KEY } from '../../../../../shared/constants/repository-entity-keys.constants';
import { RocketsAuthUserEntityInterface } from '../../../interfaces/rockets-auth-user-entity.interface';
import { AbstractAdminUserReadHandler } from '../../commands/handlers/abstract-admin-user-read.handler';

@Injectable()
export class AdminUserReadHandler extends AbstractAdminUserReadHandler {
  constructor(
    @InjectCrudAdapter(USER_CRUD_ENTITY_KEY)
    public readonly crudAdapter: CrudAdapter<RocketsAuthUserEntityInterface>,
  ) {
    super();
  }

  async execute(
    query: CrudQueryInterface<RocketsAuthUserEntityInterface>,
  ): Promise<
    | (RocketsAuthUserEntityInterface & PlainLiteralObject)
    | CrudResponsePaginatedInterface<RocketsAuthUserEntityInterface>
  > {
    return this.crudAdapter.read(query.context);
  }
}
