import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { RoleEntityInterface } from '@concepta/nestjs-role';
import {
  getDynamicRepositoryToken,
  RepositoryInterface,
  Where,
  type WhereConditionScalar,
} from '@concepta/rockets-core';

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
    const entity = await this.fetch(query, where);
    return this.mapResponse(entity);
  }

  // Annotated, not inferred: an inferred return emits
  // `import("@concepta/nestjs-repository").WhereConditionScalar` into this
  // class's public `.d.ts`, and this package depends on the repository
  // contract through rockets-core only (AGENTS.md rule 2).
  protected buildFilter(
    query: RocketsGetRoleByNameQuery,
  ): WhereConditionScalar<RoleEntityInterface> {
    return Where.eq<RoleEntityInterface>('name', query.name);
  }

  protected async fetch(
    query: RocketsGetRoleByNameQuery,
    where: ReturnType<AbstractRocketsGetRoleByNameHandler['buildFilter']>,
  ): Promise<RoleEntityInterface | null> {
    return this.roleRepo.findOne({ where, ctx: query.ctx });
  }

  protected mapResponse(
    entity: RoleEntityInterface | null,
  ): RoleEntityInterface | null {
    return entity;
  }
}
