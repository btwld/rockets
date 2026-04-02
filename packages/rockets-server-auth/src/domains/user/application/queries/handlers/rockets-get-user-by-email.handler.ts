import { QueryHandler, IQueryHandler, QueryBus } from '@nestjs/cqrs';
import { UserEntityInterface } from '@concepta/nestjs-common';
import { DomainAggregate } from '@concepta/nestjs-common/aggregate';
import { GetUserByEmailQuery } from '@concepta/nestjs-user';
import { RocketsEntity } from '../../../../../shared/constants/repository-entity-keys.constants';
import { createRepositoryContext } from '../../../../../shared/utils/repository-context.helper';
import { RocketsGetUserByEmailQuery } from '../impl/rockets-get-user-by-email.query';

@QueryHandler(RocketsGetUserByEmailQuery)
export class RocketsGetUserByEmailHandler
  implements
    IQueryHandler<
      RocketsGetUserByEmailQuery,
      DomainAggregate<UserEntityInterface> | null
    >
{
  constructor(private readonly queryBus: QueryBus) {}

  async execute(
    query: RocketsGetUserByEmailQuery,
  ): Promise<DomainAggregate<UserEntityInterface> | null> {
    const ctx = createRepositoryContext(RocketsEntity.user);
    return this.queryBus.execute(new GetUserByEmailQuery(ctx, query.email));
  }
}
