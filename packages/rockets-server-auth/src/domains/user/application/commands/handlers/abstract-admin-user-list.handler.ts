import { Injectable } from '@nestjs/common';
import {
  CrudAdapter,
  CrudListQuery,
  CrudResponsePaginatedInterface,
} from '@bitwild/rockets-crud';
import { RocketsAuthUserEntityInterface } from '../../../interfaces/rockets-auth-user-entity.interface';

/**
 * Abstract base class for admin user list query handlers.
 *
 * CrudModule dynamically applies `@QueryHandler(CrudListQuery)` via
 * CrudCqrsResolver.decorateQueryHandler — no manual decorator needed.
 *
 * To customise admin list behavior, extend this class and register
 * via `RocketsAuthModule.forRoot({ userCrud: { handlers: { adminList } } })`.
 */
@Injectable()
export abstract class AbstractAdminUserListHandler {
  abstract readonly crudAdapter: CrudAdapter<RocketsAuthUserEntityInterface>;
  abstract execute(
    query: CrudListQuery<RocketsAuthUserEntityInterface>,
  ): Promise<
    | RocketsAuthUserEntityInterface
    | CrudResponsePaginatedInterface<RocketsAuthUserEntityInterface>
  >;
}
