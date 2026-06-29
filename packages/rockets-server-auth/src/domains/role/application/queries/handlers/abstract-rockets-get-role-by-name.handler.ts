import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { RoleEntityInterface } from '@concepta/nestjs-role';
import {
  getDynamicRepositoryToken,
  RepositoryInterface,
  Where,
} from '@concepta/nestjs-repository';

import { ROLE_CRUD_ENTITY_KEY } from '../../../../../shared/constants/repository-entity-keys.constants';
import { RocketsGetRoleByNameQuery } from '../impl/rockets-get-role-by-name.query';

/**
 * Template-method query handler for `RocketsGetRoleByNameQuery`.
 *
 * Override individual seams to:
 *  - `buildFilter` — change how the name filter is composed (case-insensitive, trim, etc.)
 *  - `fetch`       — swap the data source (cache, view, alternate repo)
 *  - `mapResponse` — return a different shape (e.g. domain aggregate)
 *
 * Subclass and register via
 * `{ provide: RocketsGetRoleByNameHandler, useClass: MyGetRoleByNameHandler }`.
 */
@QueryHandler(RocketsGetRoleByNameQuery)
export abstract class AbstractRocketsGetRoleByNameHandler
  implements
    IQueryHandler<RocketsGetRoleByNameQuery, RoleEntityInterface | null>
{
  constructor(
    @Inject(getDynamicRepositoryToken(ROLE_CRUD_ENTITY_KEY))
    protected readonly roleRepo: RepositoryInterface<RoleEntityInterface>,
  ) {}

  async execute(
    query: RocketsGetRoleByNameQuery,
  ): Promise<RoleEntityInterface | null> {
    const where = this.buildFilter(query);
    const entity = await this.fetch(where);
    return this.mapResponse(entity);
  }

  protected buildFilter(query: RocketsGetRoleByNameQuery) {
    return Where.eq<RoleEntityInterface>('name', query.name);
  }

  protected async fetch(
    where: ReturnType<AbstractRocketsGetRoleByNameHandler['buildFilter']>,
  ): Promise<RoleEntityInterface | null> {
    return this.roleRepo.findOne({ where });
  }

  protected mapResponse(
    entity: RoleEntityInterface | null,
  ): RoleEntityInterface | null {
    return entity;
  }
}
