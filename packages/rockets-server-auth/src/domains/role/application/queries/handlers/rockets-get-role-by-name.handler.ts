import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { RoleEntityInterface } from '@concepta/nestjs-common';
import {
  InjectDynamicRepository,
  RepositoryInterface,
  Where,
} from '@concepta/nestjs-repository';
import { ROLE_CRUD_ENTITY_KEY } from '../../../../../shared/constants/repository-entity-keys.constants';
import { RocketsGetRoleByNameQuery } from '../impl/rockets-get-role-by-name.query';

@QueryHandler(RocketsGetRoleByNameQuery)
export class RocketsGetRoleByNameHandler
  implements
    IQueryHandler<RocketsGetRoleByNameQuery, RoleEntityInterface | null>
{
  constructor(
    @InjectDynamicRepository(ROLE_CRUD_ENTITY_KEY)
    private readonly roleRepo: RepositoryInterface<RoleEntityInterface>,
  ) {}

  async execute(
    query: RocketsGetRoleByNameQuery,
  ): Promise<RoleEntityInterface | null> {
    return this.roleRepo.findOne({
      where: Where.eq<RoleEntityInterface>('name', query.name),
    });
  }
}
