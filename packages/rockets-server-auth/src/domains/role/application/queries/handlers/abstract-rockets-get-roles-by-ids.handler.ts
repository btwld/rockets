import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { RoleEntityInterface } from '@concepta/nestjs-role';
import {
  getDynamicRepositoryToken,
  RepositoryInterface,
  Where,
} from '@concepta/nestjs-repository';

import { ROLE_CRUD_ENTITY_KEY } from '../../../../../shared/constants/repository-entity-keys.constants';
import { RocketsGetRolesByIdsQuery } from '../impl/rockets-get-roles-by-ids.query';

/**
 * Template-method query handler for `RocketsGetRolesByIdsQuery`.
 *
 * Seams: `buildFilter / fetch / mapResponse` (same shape as every other
 * read handler in this package — see `.context/v8-ddd-refactor-plan.md`
 * §2.7).
 */
@QueryHandler(RocketsGetRolesByIdsQuery)
export abstract class AbstractRocketsGetRolesByIdsHandler
  implements IQueryHandler<RocketsGetRolesByIdsQuery, RoleEntityInterface[]>
{
  constructor(
    @Inject(getDynamicRepositoryToken(ROLE_CRUD_ENTITY_KEY))
    protected readonly roleRepo: RepositoryInterface<RoleEntityInterface>,
  ) {}

  async execute(
    query: RocketsGetRolesByIdsQuery,
  ): Promise<RoleEntityInterface[]> {
    if (query.ids.length === 0) return this.mapResponse([]);

    const where = this.buildFilter(query);
    const entities = await this.fetch(where);
    return this.mapResponse(entities);
  }

  protected buildFilter(query: RocketsGetRolesByIdsQuery) {
    return Where.in<RoleEntityInterface>('id', [...query.ids]);
  }

  protected async fetch(
    where: ReturnType<AbstractRocketsGetRolesByIdsHandler['buildFilter']>,
  ): Promise<RoleEntityInterface[]> {
    return this.roleRepo.find({ where });
  }

  protected mapResponse(
    entities: RoleEntityInterface[],
  ): RoleEntityInterface[] {
    return entities;
  }
}
