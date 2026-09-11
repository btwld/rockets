import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import type { RoleEntityInterface } from '@concepta/nestjs-role';
import {
  getDynamicRepositoryToken,
  type RepositoryInterface,
  Where,
} from '@concepta/rockets-core';

import { ROLE_CRUD_ENTITY_KEY } from '../../../../../shared/constants/repository-entity-keys.constants';
import { RocketsGetRolesByIdsQuery } from '../impl/rockets-get-roles-by-ids.query';

/**
 * Template-method query handler for `RocketsGetRolesByIdsQuery`.
 *
 * Override `buildFilter`, `fetch`, or `mapResponse` for targeted behavior.
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
    const entities = await this.fetch(query, where);
    return this.mapResponse(entities);
  }

  protected buildFilter(query: RocketsGetRolesByIdsQuery) {
    return Where.in<RoleEntityInterface>('id', [...query.ids]);
  }

  protected async fetch(
    query: RocketsGetRolesByIdsQuery,
    where: ReturnType<AbstractRocketsGetRolesByIdsHandler['buildFilter']>,
  ): Promise<RoleEntityInterface[]> {
    return this.roleRepo.find({ where, ctx: query.ctx });
  }

  protected mapResponse(
    entities: RoleEntityInterface[],
  ): RoleEntityInterface[] {
    return entities;
  }
}
