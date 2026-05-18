import { CrudResponsePaginatedDto, CrudModule } from '@concepta/nestjs-crud';
import {
  applyDecorators,
  DynamicModule,
  Module,
  Type,
  UseGuards,
} from '@nestjs/common';
import { Operation } from '@concepta/nestjs-common';
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Exclude, Expose, Type as TransformType } from 'class-transformer';

import { RocketsAuthRoleUpdateDto } from '../infrastructure/dto/rockets-auth-role-update.dto';
import { RocketsAuthRoleDto } from '../infrastructure/dto/rockets-auth-role.dto';
import { RocketsAuthRoleCreateDto } from '../infrastructure/dto/rockets-auth-role-create.dto';
import { AdminGuard } from '../../../guards/admin.guard';
import { ROLE_CRUD_ENTITY_KEY } from '../../../shared/constants/repository-entity-keys.constants';
import { RoleCrudOptionsExtrasInterface } from '../../../shared/interfaces/rockets-auth-options-extras.interface';
import { RocketsAuthRoleEntityInterface } from '../interfaces/rockets-auth-role-entity.interface';
import { RocketsAuthRoleInterface } from '../interfaces/rockets-auth-role.interface';
import { buildAdminUserRolesController } from '../gateways/http/factories/build-admin-user-roles-controller';
import {
  AdminRoleResourceExtras,
  AdminUserRolesControllerExtras,
} from '../interfaces/role-controller-extras.interface';

function operationExtraDecorators(
  decorators: MethodDecorator[] | undefined,
):
  | { extraDecorators: ReturnType<typeof applyDecorators>[] }
  | Record<string, never> {
  if (!decorators?.length) {
    return {};
  }
  return { extraDecorators: [applyDecorators(...decorators)] };
}

/**
 * Build the operations array for the admin/roles CRUD resource. Each
 * operation honors per-route extras (`decorators`, `handler`) supplied by
 * the consumer.
 */
function buildOperations(
  createDto: Type<object>,
  updateDto: Type<object>,
  modelDto: Type<object>,
  resourceExtras: AdminRoleResourceExtras = {},
) {
  const routes = resourceExtras.routes ?? {};

  return [
    {
      operation: Operation.List,
      ...operationExtraDecorators(routes.list?.decorators),
    },
    {
      operation: Operation.Read,
      ...operationExtraDecorators(routes.read?.decorators),
    },
    {
      operation: Operation.Create,
      request: { body: createDto },
      ...operationExtraDecorators(routes.create?.decorators),
      ...(routes.create?.handler
        ? { commandHandler: routes.create.handler }
        : {}),
    },
    {
      operation: Operation.Update,
      request: {
        body: updateDto,
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
          type: updateDto,
          description: 'Role information to update',
        },
        response: {
          status: 200,
          description: 'Role updated successfully',
          type: modelDto,
        },
      },
      ...operationExtraDecorators(routes.update?.decorators),
      ...(routes.update?.handler
        ? { commandHandler: routes.update.handler }
        : {}),
    },
    {
      operation: Operation.Delete,
      ...operationExtraDecorators(routes.delete?.decorators),
    },
  ];
}

@Module({})
export class RocketsAuthRoleAdminModule {
  static register(admin: RoleCrudOptionsExtrasInterface): DynamicModule {
    const ModelDto = admin.model || RocketsAuthRoleDto;
    const UpdateDto = admin.dto?.updateOne || RocketsAuthRoleUpdateDto;
    const CreateDto = admin.dto?.createOne || RocketsAuthRoleCreateDto;
    const resourceExtras: AdminRoleResourceExtras =
      admin.controller?.adminResource ?? {};
    const userRolesExtras: AdminUserRolesControllerExtras =
      admin.controller?.userRoles ?? {};

    @Exclude()
    class AdminRolesPaginatedDto extends CrudResponsePaginatedDto<RocketsAuthRoleInterface> {
      @Expose()
      @ApiProperty({
        type: ModelDto,
        isArray: true,
        description: 'Array of Roles',
      })
      @TransformType(() => ModelDto)
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
              response: {
                resource: ModelDto,
                paginated: AdminRolesPaginatedDto,
              },
              extraDecorators: [
                applyDecorators(
                  ApiTags('admin'),
                  UseGuards(AdminGuard),
                  ApiBearerAuth(),
                ),
                ...(resourceExtras.classDecorators?.length
                  ? [applyDecorators(...resourceExtras.classDecorators)]
                  : []),
              ],
            },
            operations: buildOperations(
              CreateDto,
              UpdateDto,
              ModelDto,
              resourceExtras,
            ),
          },
        }),
      ],
      controllers: [buildAdminUserRolesController(userRolesExtras)],
      providers: [],
    };
  }
}
