import { CrudModule, type CrudOperationOptions } from '@concepta/nestjs-crud';
import {
  applyDecorators,
  type DynamicModule,
  Module,
  UseGuards,
} from '@nestjs/common';
import { Operation } from '@concepta/nestjs-core';
import {
  assertFailClosedResponse,
  assertNamedSchema,
  assertNoHiddenFields,
  paginatedSchema,
  rocketsSchemaValidation,
  withOpenApi,
} from '@concepta/rockets-core';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';

import { rocketsAuthRoleUpdateSchema } from '../infrastructure/schemas/rockets-auth-role-update.schema';
import { rocketsAuthRoleSchema } from '../infrastructure/schemas/rockets-auth-role.schema';
import { rocketsAuthRoleCreateSchema } from '../infrastructure/schemas/rockets-auth-role-create.schema';
import { AdminGuard } from '../../../guards/admin.guard';
import { ROLE_CRUD_ENTITY_KEY } from '../../../shared/constants/repository-entity-keys.constants';
import type { RoleCrudOptionsExtrasInterface } from '../../../shared/interfaces/rockets-auth-options-extras.interface';
import type { RocketsAuthRoleEntityInterface } from '../interfaces/rockets-auth-role-entity.interface';
import { buildAdminUserRolesController } from '../gateways/http/factories/build-admin-user-roles-controller';
import type {
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

function buildOperations(
  createSchema: z.ZodType,
  updateSchema: z.ZodType,
  resourceExtras: AdminRoleResourceExtras = {},
): CrudOperationOptions<RocketsAuthRoleEntityInterface>[] {
  const routes = resourceExtras.routes ?? {};

  return [
    {
      operation: Operation.List,
      ...operationExtraDecorators(routes.list?.decorators),
      ...(routes.list?.handler ? { queryHandler: routes.list.handler } : {}),
    },
    {
      operation: Operation.Read,
      ...operationExtraDecorators(routes.read?.decorators),
      ...(routes.read?.handler ? { queryHandler: routes.read.handler } : {}),
    },
    {
      operation: Operation.Create,
      request: { body: createSchema },
      ...operationExtraDecorators(routes.create?.decorators),
      ...(routes.create?.handler
        ? { commandHandler: routes.create.handler }
        : {}),
    },
    {
      operation: Operation.Update,
      request: { body: updateSchema },
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
        response: {
          status: 200,
          description: 'Role updated successfully',
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
      ...(routes.delete?.handler
        ? { commandHandler: routes.delete.handler }
        : {}),
    },
  ];
}

@Module({})
export class RocketsAuthRoleAdminModule {
  static register(admin: RoleCrudOptionsExtrasInterface): DynamicModule {
    const modelSchema = admin.model || rocketsAuthRoleSchema;
    assertNamedSchema(
      modelSchema,
      'RocketsAuthRoleAdminModule: roleCrud.model',
    );
    // A consumer-supplied model reaches upstream CRUD serialization
    // directly (no `defineResource` projection): it must strip undeclared
    // keys and carry no `dto: { response: false }` field.
    assertFailClosedResponse(
      modelSchema,
      'RocketsAuthRoleAdminModule: roleCrud.model',
    );
    assertNoHiddenFields(
      modelSchema,
      'RocketsAuthRoleAdminModule: roleCrud.model',
    );
    const updateSchema = admin.dto?.updateOne || rocketsAuthRoleUpdateSchema;
    assertNamedSchema(
      updateSchema,
      'RocketsAuthRoleAdminModule: roleCrud.dto.updateOne',
    );
    const createSchema = admin.dto?.createOne || rocketsAuthRoleCreateSchema;
    assertNamedSchema(
      createSchema,
      'RocketsAuthRoleAdminModule: roleCrud.dto.createOne',
    );
    const resourceExtras: AdminRoleResourceExtras =
      admin.controller?.adminResource ?? {};
    const userRolesExtras: AdminUserRolesControllerExtras =
      admin.controller?.userRoles ?? {};

    return {
      module: RocketsAuthRoleAdminModule,
      imports: [
        ...(admin.imports || []),
        CrudModule.forFeature<RocketsAuthRoleEntityInterface>({
          crud: {
            controller: {
              path: admin.path || 'admin/roles',
              entity: ROLE_CRUD_ENTITY_KEY,
              // `body` lives on the operations (see buildOperations): upstream
              // stamps the validation pipe from the METHOD-level body only.
              request: { validation: rocketsSchemaValidation },
              response: {
                resource: modelSchema,
                // Component id kept from the class-DTO era — part of the
                // published OpenAPI contract.
                paginated: withOpenApi(
                  paginatedSchema(modelSchema),
                  'AdminRolesPaginatedDto',
                ),
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
              createSchema,
              updateSchema,
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
