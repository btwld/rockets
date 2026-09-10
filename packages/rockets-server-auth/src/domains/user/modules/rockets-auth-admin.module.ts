import { DynamicModule, Module, UseGuards } from '@nestjs/common';
import { Operation } from '@concepta/nestjs-core';
import { CqrsModule } from '@nestjs/cqrs';
import {
  CrudModule,
  CrudOperationResolver,
  CrudListQuery,
  CrudReadQuery,
  CrudUpdateCommand,
  CrudDeleteCommand,
} from '@concepta/nestjs-crud';
import { CrudJoin } from '@concepta/nestjs-crud';
import {
  assertFailClosedResponse,
  assertNamedSchema,
  assertNoHiddenFields,
  paginatedSchema,
  rocketsSchemaValidation,
  withOpenApi,
} from '@concepta/rockets-core';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { rocketsAuthUserUpdateSchema } from '../infrastructure/schemas/rockets-auth-user-update.schema';
import { rocketsAuthUserSchema } from '../infrastructure/schemas/rockets-auth-user.schema';
import { resolveUserMetadataSchemas } from '../infrastructure/schemas/rockets-auth-user-metadata.schema';
import { AdminGuard } from '../../../guards/admin.guard';
import {
  USER_CRUD_ENTITY_KEY,
  USER_METADATA_MODULE_ENTITY_KEY,
} from '../../../shared/constants/repository-entity-keys.constants';
import { UserCrudOptionsExtrasInterface } from '../../../shared/interfaces/rockets-auth-options-extras.interface';
import { RocketsAuthUserEntityInterface } from '../interfaces/rockets-auth-user-entity.interface';

// Application – Query handlers
import { AdminUserListHandler } from '../application/queries/handlers/admin-user-list.handler';
import { AdminUserReadHandler } from '../application/queries/handlers/admin-user-read.handler';

// Application – Command handlers
import { AdminUpdateUserHandler } from '../application/commands/handlers/admin-update-user.handler';
import { AdminDeleteUserHandler } from '../application/commands/handlers/admin-delete-user.handler';
import { UpdateUserHandler } from '../application/commands/handlers/update-user.handler';

@Module({})
export class RocketsAuthAdminModule {
  static register(admin: UserCrudOptionsExtrasInterface): DynamicModule {
    const userMetadata = resolveUserMetadataSchemas(admin.userMetadataConfig);
    const modelSchema =
      admin.model ?? rocketsAuthUserSchema(userMetadata.responseSchema);
    assertNamedSchema(modelSchema, 'RocketsAuthAdminModule: userCrud.model');
    // A consumer-supplied model reaches upstream CRUD serialization
    // directly (no `defineResource` projection): it must strip undeclared
    // keys and carry no `dto: { response: false }` field.
    assertFailClosedResponse(
      modelSchema,
      'RocketsAuthAdminModule: userCrud.model',
    );
    assertNoHiddenFields(modelSchema, 'RocketsAuthAdminModule: userCrud.model');
    const updateSchema =
      admin.dto?.updateOne ??
      rocketsAuthUserUpdateSchema(userMetadata.updateSchema);
    assertNamedSchema(
      updateSchema,
      'RocketsAuthAdminModule: userCrud.dto.updateOne',
    );
    const ListHandler = admin.handlers?.adminList ?? AdminUserListHandler;
    const ReadHandler = admin.handlers?.adminRead ?? AdminUserReadHandler;
    const UpdateHandler = admin.handlers?.adminUpdate ?? AdminUpdateUserHandler;
    const DeleteHandler = admin.handlers?.adminDelete ?? AdminDeleteUserHandler;

    return {
      module: RocketsAuthAdminModule,
      imports: [
        ...(admin.imports || []),
        CqrsModule,
        CrudModule.forFeature<RocketsAuthUserEntityInterface>({
          crud: {
            controller: {
              path: admin.path || 'admin/users',
              entity: USER_CRUD_ENTITY_KEY,
              resolver: CrudOperationResolver,
              // `body` lives on the operation, not here: upstream stamps the
              // validation pipe from the METHOD-level body only, so a
              // controller-level body documents the route and validates
              // nothing.
              request: { validation: rocketsSchemaValidation },
              response: {
                resource: modelSchema,
                // Component id kept from the class-DTO era — part of the
                // published OpenAPI contract.
                paginated: withOpenApi(
                  paginatedSchema(modelSchema),
                  'AdminUsersPaginatedDto',
                ),
              },
              extraDecorators: [
                ApiTags('admin'),
                UseGuards(AdminGuard),
                ApiBearerAuth(),
                CrudJoin([
                  {
                    relation: USER_METADATA_MODULE_ENTITY_KEY,
                    joinType: 'LEFT',
                  },
                ]),
              ],
            },
            operations: [
              {
                operation: Operation.List,
                query: CrudListQuery,
                queryHandler: ListHandler,
              },
              {
                operation: Operation.Read,
                query: CrudReadQuery,
                queryHandler: ReadHandler,
              },
              {
                operation: Operation.Update,
                request: { body: updateSchema },
                command: CrudUpdateCommand,
                commandHandler: UpdateHandler,
                api: {
                  params: {
                    name: 'id',
                    required: true,
                    description: 'User id',
                  },
                },
              },
              {
                operation: Operation.Delete,
                command: CrudDeleteCommand,
                commandHandler: DeleteHandler,
                api: {
                  params: {
                    name: 'id',
                    required: true,
                    description: 'User id',
                  },
                },
              },
            ],
          },
        }),
      ],
      providers: [
        // Application: query handlers
        ListHandler,
        ReadHandler,
        // Application: command handlers
        UpdateHandler,
        DeleteHandler,
        UpdateUserHandler,
        // SaveUserMetadataHandler / GetUserMetadataHandler / USER_METADATA_REPOSITORY_TOKEN
        // are provided globally by RocketsAuthUserMetadataModule.
      ],
      exports: [],
    };
  }
}
