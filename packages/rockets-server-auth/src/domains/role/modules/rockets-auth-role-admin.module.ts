import { CrudResponsePaginatedDto, CrudModule } from '@concepta/nestjs-crud';
import { DynamicModule, Module, UseGuards } from '@nestjs/common';
import { Operation } from '@concepta/nestjs-common';
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';

import { RocketsAuthRoleUpdateDto } from '../dto/rockets-auth-role-update.dto';
import { RocketsAuthRoleDto } from '../dto/rockets-auth-role.dto';
import { AdminGuard } from '../../../guards/admin.guard';
import { ROLE_CRUD_ENTITY_KEY } from '../../../shared/constants/repository-entity-keys.constants';
import { RoleCrudOptionsExtrasInterface } from '../../../shared/interfaces/rockets-auth-options-extras.interface';
import { RocketsAuthRoleEntityInterface } from '../interfaces/rockets-auth-role-entity.interface';
import { RocketsAuthRoleInterface } from '../interfaces/rockets-auth-role.interface';
import { AdminUserRolesController } from '../controllers/admin-user-roles.controller';
import { RocketsAuthRoleCreateDto } from '../dto/rockets-auth-role-create.dto';
import { RoleRepositoryCrudAdapter } from '../infrastructure/adapters/role-repository-crud.adapter';

@Module({})
export class RocketsAuthRoleAdminModule {
  static register(admin: RoleCrudOptionsExtrasInterface): DynamicModule {
    const ModelDto = admin.model || RocketsAuthRoleDto;
    const UpdateDto = admin.dto?.updateOne || RocketsAuthRoleUpdateDto;
    const CreateDto = admin.dto?.createOne || RocketsAuthRoleCreateDto;

    @Exclude()
    class AdminRolesPaginatedDto extends CrudResponsePaginatedDto<RocketsAuthRoleInterface> {
      @Expose()
      @ApiProperty({
        type: ModelDto,
        isArray: true,
        description: 'Array of Roles',
      })
      @Type(() => ModelDto)
      data: RocketsAuthRoleInterface[] = [];
    }

    return {
      module: RocketsAuthRoleAdminModule,
      imports: [
        ...(admin.imports || []),
        CrudModule.forFeature<RocketsAuthRoleEntityInterface>({
          crud: {
            controller: {
              path: admin.path || 'admin/roles',
              entity: ROLE_CRUD_ENTITY_KEY,
              adapter: RoleRepositoryCrudAdapter,
              response: {
                resource: ModelDto,
                paginated: AdminRolesPaginatedDto,
              },
              extraDecorators: [
                ApiTags('admin'),
                UseGuards(AdminGuard),
                ApiBearerAuth(),
              ],
            },
            operations: [
              { operation: Operation.List },
              { operation: Operation.Read },
              {
                operation: Operation.Create,
                request: { body: CreateDto },
              },
              {
                operation: Operation.Update,
                request: {
                  body: UpdateDto,
                  validation: {
                    whitelist: true,
                    skipMissingProperties: true,
                    forbidUnknownValues: true,
                  },
                },
                api: {
                  operation: {
                    summary: 'Update role',
                    description: 'Updates role information',
                  },
                  params: {
                    name: 'id',
                    required: true,
                    description: 'Role id',
                  },
                  body: {
                    type: UpdateDto,
                    description: 'Role information to update',
                  },
                  response: {
                    status: 200,
                    description: 'Role updated successfully',
                    type: ModelDto,
                  },
                },
              },
              { operation: Operation.Delete },
            ],
          },
        }),
      ],
      controllers: [AdminUserRolesController],
      providers: [RoleRepositoryCrudAdapter],
    };
  }
}
