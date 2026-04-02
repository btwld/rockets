import { Injectable, PlainLiteralObject } from '@nestjs/common';
import {
  CrudAdapter,
  CrudResponsePaginatedInterface,
} from '@concepta/nestjs-crud';
import type { CrudQueryHandlerInterface } from '@concepta/nestjs-crud/dist/application/queries/interfaces/crud-query-handler.interface';
import type { CrudQueryInterface } from '@concepta/nestjs-crud/dist/application/queries/interfaces/crud-query.interface';
import { RocketsAuthUserEntityInterface } from '../../../interfaces/rockets-auth-user-entity.interface';

/**
 * Abstract base class for admin user read query handlers.
 *
 * CrudModule dynamically applies `@QueryHandler(CrudReadQuery)` via
 * CrudCqrsResolver.decorateQueryHandler — no manual decorator needed.
 *
 * To customise admin read behavior, extend this class and register
 * via `RocketsAuthModule.forRoot({ userCrud: { handlers: { adminRead } } })`.
 */
@Injectable()
export abstract class AbstractAdminUserReadHandler
  implements CrudQueryHandlerInterface<RocketsAuthUserEntityInterface>
{
  abstract readonly crudAdapter: CrudAdapter<RocketsAuthUserEntityInterface>;
  abstract execute(
    query: CrudQueryInterface<RocketsAuthUserEntityInterface>,
  ): Promise<
    | (RocketsAuthUserEntityInterface & PlainLiteralObject)
    | CrudResponsePaginatedInterface<RocketsAuthUserEntityInterface>
  >;
}
