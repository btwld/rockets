import { Injectable } from '@nestjs/common';
import {
  CrudAdapter,
  CrudListQuery,
  CrudResponsePaginatedInterface,
  InjectCrudAdapter,
} from '@concepta/nestjs-crud';
import { USER_CRUD_ENTITY_KEY } from '../../../../../shared/constants/repository-entity-keys.constants';
import { RocketsAuthUserEntityInterface } from '../../../interfaces/rockets-auth-user-entity.interface';
import { AbstractAdminUserListHandler } from '../../commands/handlers/abstract-admin-user-list.handler';

@Injectable()
export class AdminUserListHandler extends AbstractAdminUserListHandler {
  constructor(
    @InjectCrudAdapter(USER_CRUD_ENTITY_KEY)
    public readonly crudAdapter: CrudAdapter<RocketsAuthUserEntityInterface>,
  ) {
    super();
  }

  async execute(
    query: CrudListQuery<RocketsAuthUserEntityInterface>,
  ): Promise<
    | RocketsAuthUserEntityInterface
    | CrudResponsePaginatedInterface<RocketsAuthUserEntityInterface>
  > {
    return this.crudAdapter.list(query.context);
  }
}
