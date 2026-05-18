import { QueryBus, QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import type { AuthenticationUserResult } from '@concepta/nestjs-authentication';
import { DomainAggregate } from '@concepta/nestjs-common/aggregate';
import { GetUserByUsernameQuery, UserInterface } from '@concepta/nestjs-user';

import { RocketsAuthUserPortGetByUsernameQuery } from '../impl/rockets-auth-user-port-get-by-username.query';

/**
 * Dispatches upstream `GetUserByUsernameQuery` with the HTTP request repository
 * context from `UserPort#getByUsername` (`query.ctx`, i.e. `getAppContext(req)`).
 * Using `createRepositoryContext()` here breaks TypeORM adapters: they expect
 * an `AppContextHost`, not a plain object.
 */
@QueryHandler(RocketsAuthUserPortGetByUsernameQuery)
export class RocketsAuthUserPortGetByUsernameHandler
  implements
    IQueryHandler<
      RocketsAuthUserPortGetByUsernameQuery,
      AuthenticationUserResult
    >
{
  constructor(private readonly queryBus: QueryBus) {}

  async execute(
    query: RocketsAuthUserPortGetByUsernameQuery,
  ): Promise<AuthenticationUserResult> {
    const aggregate = await this.queryBus.execute<
      GetUserByUsernameQuery,
      DomainAggregate<UserInterface> | null
    >(new GetUserByUsernameQuery(query.ctx, query.username));

    if (!aggregate) {
      return null;
    }

    const plain = aggregate.toPlain();
    return {
      id: plain.id,
      email: plain.email,
      username: plain.username,
      active: plain.active,
    };
  }
}
