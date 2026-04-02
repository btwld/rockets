import { QueryHandler, IQueryHandler, QueryBus } from '@nestjs/cqrs';
import {
  UserEntityInterface,
  ReferenceIdInterface,
} from '@concepta/nestjs-common';
import { DomainAggregate } from '@concepta/nestjs-common/aggregate';
import { GetUserBySubjectQuery } from '@concepta/nestjs-user';
import { RocketsEntity } from '../../../../../shared/constants/repository-entity-keys.constants';
import { createRepositoryContext } from '../../../../../shared/utils/repository-context.helper';
import { RocketsGetUserBySubjectQuery } from '../impl/rockets-get-user-by-subject.query';

@QueryHandler(RocketsGetUserBySubjectQuery)
export class RocketsGetUserBySubjectHandler
  implements
    IQueryHandler<
      RocketsGetUserBySubjectQuery,
      DomainAggregate<UserEntityInterface> | ReferenceIdInterface | null
    >
{
  constructor(private readonly queryBus: QueryBus) {}

  async execute(
    query: RocketsGetUserBySubjectQuery,
  ): Promise<
    DomainAggregate<UserEntityInterface> | ReferenceIdInterface | null
  > {
    const ctx = createRepositoryContext(RocketsEntity.user);
    return this.queryBus.execute(
      new GetUserBySubjectQuery(ctx, String(query.subject)),
    );
  }
}
