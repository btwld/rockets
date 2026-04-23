import { Injectable } from '@nestjs/common';
import {
  CrudAdapter,
  CrudListQuery,
  CrudResponsePaginatedInterface,
  InjectCrudAdapter,
} from '@bitwild/rockets-crud';
import { getLocal } from '../../utils/get-local.helper';
// TODO: deep imports — move to barrel when @concepta/nestjs-crud exports these
import { CrudQueryHandler } from '@concepta/nestjs-crud/dist/application/queries/handlers/crud-query.handler';
import type { CrudQueryInterface } from '@concepta/nestjs-crud/dist/application/queries/interfaces/crud-query.interface';
import { WhereOperator, type EntityColumn } from '@bitwild/rockets-repository';
import { PET_MODULE_PET_ENTITY_KEY } from '../../constants/pet.constants';
import { AppRole } from '../../../../app.acl';
import { PetEntity } from './pet.entity';
import {
  JwtAuthenticatedUserLocal,
  JwtAuthenticatedUserPayload,
} from '../../jwt-authenticated-user.local';

/**
 * List handler: users with only the default `user` role see pets filtered by their id.
 * Admins and managers see all pets (ACL still applies on the route).
 */
@Injectable()
export class PetListHandler extends CrudQueryHandler<PetEntity> {
  constructor(
    @InjectCrudAdapter(PET_MODULE_PET_ENTITY_KEY)
    crudAdapter: CrudAdapter<PetEntity>,
  ) {
    super(crudAdapter);
  }

  async execute(
    query: CrudQueryInterface<PetEntity>,
  ): Promise<CrudResponsePaginatedInterface<PetEntity>> {
    const listQuery = query as CrudListQuery<PetEntity>;
    const user = getLocal<JwtAuthenticatedUserPayload>(
      listQuery.context,
      JwtAuthenticatedUserLocal,
    );
    if (!user?.id || !user.userRoles?.length) {
      return this.crudAdapter.list(listQuery.context);
    }

    const roleNames = user.userRoles.map(
      (ur: { role: { name: string } }) => ur.role.name,
    );
    const hasOnlyUserRole =
      roleNames.includes(AppRole.User) &&
      !roleNames.includes(AppRole.Admin) &&
      !roleNames.includes(AppRole.Manager);

    if (!hasOnlyUserRole) {
      return this.crudAdapter.list(listQuery.context);
    }

    const ctx = listQuery.context;
    const existingFilter = ctx.query.filter ?? [];
    const mergedContext = {
      ...ctx,
      query: {
        ...ctx.query,
        filter: [
          ...existingFilter,
          {
            field: 'userId' as EntityColumn<PetEntity>,
            operator: WhereOperator.EQ,
            value: user.id,
          },
        ],
      },
    };
    return this.crudAdapter.list(mergedContext);
  }
}
