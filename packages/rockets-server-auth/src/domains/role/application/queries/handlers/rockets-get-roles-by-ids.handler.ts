import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { RoleEntityInterface } from '@concepta/nestjs-common';
import {
  InjectDynamicRepository,
  RepositoryInterface,
  Where,
} from '@concepta/nestjs-repository';
import { ROLE_CRUD_ENTITY_KEY } from '../../../../../shared/constants/repository-entity-keys.constants';
import { RocketsGetRolesByIdsQuery } from '../impl/rockets-get-roles-by-ids.query';

@QueryHandler(RocketsGetRolesByIdsQuery)
export class RocketsGetRolesByIdsHandler
  implements IQueryHandler<RocketsGetRolesByIdsQuery, RoleEntityInterface[]>
{
  constructor(
    @InjectDynamicRepository(ROLE_CRUD_ENTITY_KEY)
    private readonly roleRepo: RepositoryInterface<RoleEntityInterface>,
  ) {}

  async execute(
    query: RocketsGetRolesByIdsQuery,
  ): Promise<RoleEntityInterface[]> {
    if (query.ids.length === 0) return [];

    return this.roleRepo.find({
      where: Where.in<RoleEntityInterface>('id', [...query.ids]),
    });
  }
}
