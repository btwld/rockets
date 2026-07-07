import { HttpStatus } from '@nestjs/common';
import { QueryBus, QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import {
  GetUserQuery as UpstreamGetUserQuery,
  User,
} from '@concepta/nestjs-user';
import { RocketsEntity } from '../../../../../shared/constants/repository-entity-keys.constants';

import { userAggregateToEntity } from '../../../../../shared/utils/aggregate-mappers';

import { RocketsAuthUserEntityInterface } from '../../../interfaces/rockets-auth-user-entity.interface';
import { RocketsAuthUserMetadataEntityInterface } from '../../../interfaces/rockets-auth-user-metadata-entity.interface';
import { UserException } from '../../../domain/exceptions/user.exception';
import { GetUserQuery } from '../impl/get-user.query';
import { GetUserMetadataQuery } from '../impl/get-user-metadata.query';
import { createRepositoryContext } from '@bitwild/rockets-core';

@QueryHandler(GetUserQuery)
export class GetUserHandler implements IQueryHandler<GetUserQuery> {
  constructor(private readonly queryBus: QueryBus) {}

  async execute(query: GetUserQuery): Promise<RocketsAuthUserEntityInterface> {
    const userId = String(query.id);
    const ctx = createRepositoryContext(RocketsEntity.user);

    const [user, userMetadata] = await Promise.all([
      this.queryBus.execute<UpstreamGetUserQuery, User | null>(
        new UpstreamGetUserQuery(ctx, query.id),
      ),
      this.queryBus.execute<
        GetUserMetadataQuery,
        RocketsAuthUserMetadataEntityInterface | null
      >(new GetUserMetadataQuery(userId)),
    ]);

    if (!user) {
      throw new UserException('User not found', {
        httpStatus: HttpStatus.NOT_FOUND,
      });
    }

    return {
      ...userAggregateToEntity(user),
      userMetadata: userMetadata ?? undefined,
    };
  }
}
