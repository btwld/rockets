import { QueryHandler, IQueryHandler, QueryBus } from '@nestjs/cqrs';
import { UserEntityInterface } from '@concepta/nestjs-common';
import { DomainAggregate } from '@concepta/nestjs-common/aggregate';
import { GetUserByUsernameQuery } from '@concepta/nestjs-user';
import { RocketsEntity } from '../../../../../shared/constants/repository-entity-keys.constants';
import { createRepositoryContext } from '../../../../../shared/utils/repository-context.helper';
import { RocketsGetUserByUsernameQuery } from '../impl/rockets-get-user-by-username.query';

@QueryHandler(RocketsGetUserByUsernameQuery)
export class RocketsGetUserByUsernameHandler
  implements
    IQueryHandler<
      RocketsGetUserByUsernameQuery,
      DomainAggregate<UserEntityInterface> | null
    >
{
  constructor(private readonly queryBus: QueryBus) {}

  async execute(
    query: RocketsGetUserByUsernameQuery,
  ): Promise<DomainAggregate<UserEntityInterface> | null> {
    const ctx = createRepositoryContext(RocketsEntity.user);
    return this.queryBus.execute(
      new GetUserByUsernameQuery(ctx, query.username),
    );
  }
}
