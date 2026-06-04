import { QueryHandler, IQueryHandler, QueryBus } from '@nestjs/cqrs';
import { UserInterface } from '@concepta/nestjs-user';
import { DomainAggregate } from '@concepta/nestjs-common/aggregate';
import { GetUserQuery } from '@concepta/nestjs-user';
import { RocketsEntity } from '../../../../../shared/constants/repository-entity-keys.constants';
import { createRepositoryContext } from '@bitwild/rockets-app';
import { RocketsGetUserByIdQuery } from '../impl/rockets-get-user-by-id.query';

@QueryHandler(RocketsGetUserByIdQuery)
export class RocketsGetUserByIdHandler
  implements
    IQueryHandler<
      RocketsGetUserByIdQuery,
      DomainAggregate<UserInterface> | null
    >
{
  constructor(private readonly queryBus: QueryBus) {}

  async execute(
    query: RocketsGetUserByIdQuery,
  ): Promise<DomainAggregate<UserInterface> | null> {
    const ctx = createRepositoryContext(RocketsEntity.user);
    return this.queryBus.execute(new GetUserQuery(ctx, query.id));
  }
}
