import { Inject, Injectable } from '@nestjs/common';
import { CrudAdapter } from '@concepta/nestjs-crud';
import {
  getDynamicRepositoryToken,
  type RepositoryInterface,
} from '@concepta/nestjs-repository';

import { ROLE_CRUD_ENTITY_KEY } from '../../../../shared/constants/repository-entity-keys.constants';
import { RocketsAuthRoleEntityInterface } from '../../interfaces/rockets-auth-role-entity.interface';

/**
 * Bridges admin role CRUD (CrudModule) to {@link RepositoryInterface} registered
 * under {@link ROLE_CRUD_ENTITY_KEY}. Apps configure `repositoryPersistence` +
 * `roleCrud.imports`; they do not pass a custom adapter in `forRoot`.
 */
@Injectable()
export class RoleRepositoryCrudAdapter extends CrudAdapter<RocketsAuthRoleEntityInterface> {
  public constructor(
    @Inject(getDynamicRepositoryToken(ROLE_CRUD_ENTITY_KEY))
    repository: RepositoryInterface<RocketsAuthRoleEntityInterface>,
  ) {
    super(repository);
  }
}
