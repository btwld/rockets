import { QueryHandler, IQueryHandler, QueryBus } from '@nestjs/cqrs';
import { UserInterface } from '@concepta/nestjs-user';
import { DomainAggregate } from '@concepta/nestjs-core/aggregate';
import { GetUserByUsernameQuery } from '@concepta/nestjs-user';
import { RocketsEntity } from '../../../../../shared/constants/repository-entity-keys.constants';

import { RocketsGetUserByUsernameQuery } from '../impl/rockets-get-user-by-username.query';
import { createRepositoryContext } from '@bitwild/rockets-common';

@QueryHandler(RocketsGetUserByUsernameQuery)
export class RocketsGetUserByUsernameHandler
  implements
    IQueryHandler<
      RocketsGetUserByUsernameQuery,
      DomainAggregate<UserInterface> | null
    >
{
  constructor(private readonly queryBus: QueryBus) {}

  async execute(
    query: RocketsGetUserByUsernameQuery,
  ): Promise<DomainAggregate<UserInterface> | null> {
    const ctx = createRepositoryContext(RocketsEntity.user);
    return this.queryBus.execute(
      new GetUserByUsernameQuery(ctx, query.username),
    );
  }
}
