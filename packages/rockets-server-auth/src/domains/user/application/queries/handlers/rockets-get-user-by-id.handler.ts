import { QueryHandler, IQueryHandler, QueryBus } from '@nestjs/cqrs';
import { UserEntityInterface } from '@concepta/nestjs-common';
import { DomainAggregate } from '@concepta/nestjs-common/aggregate';
import { GetUserQuery as ConceptaGetUserQuery } from '@concepta/nestjs-user';
import { RocketsEntity } from '../../../../../shared/constants/repository-entity-keys.constants';
import { createRepositoryContext } from '../../../../../shared/utils/repository-context.helper';
import { RocketsGetUserByIdQuery } from '../impl/rockets-get-user-by-id.query';

@QueryHandler(RocketsGetUserByIdQuery)
export class RocketsGetUserByIdHandler
  implements
    IQueryHandler<
      RocketsGetUserByIdQuery,
      DomainAggregate<UserEntityInterface> | null
    >
{
  constructor(private readonly queryBus: QueryBus) {}

  async execute(
    query: RocketsGetUserByIdQuery,
  ): Promise<DomainAggregate<UserEntityInterface> | null> {
    const ctx = createRepositoryContext(RocketsEntity.user);
    return this.queryBus.execute(new ConceptaGetUserQuery(ctx, query.id));
  }
}
