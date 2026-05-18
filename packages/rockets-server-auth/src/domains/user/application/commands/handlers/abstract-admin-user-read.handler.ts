import { Injectable, PlainLiteralObject } from '@nestjs/common';
import {
  CrudAdapter,
  CrudReadQuery,
  CrudResponsePaginatedInterface,
} from '@concepta/nestjs-crud';
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
export abstract class AbstractAdminUserReadHandler {
  abstract readonly crudAdapter: CrudAdapter<RocketsAuthUserEntityInterface>;
  abstract execute(
    query: CrudReadQuery<RocketsAuthUserEntityInterface>,
  ): Promise<
    | (RocketsAuthUserEntityInterface & PlainLiteralObject)
    | CrudResponsePaginatedInterface<RocketsAuthUserEntityInterface>
  >;
}
