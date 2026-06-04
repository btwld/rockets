import { DynamicModule, Module, UseGuards } from '@nestjs/common';
import { Operation } from '@bitwild/rockets-app';
import { CqrsModule } from '@nestjs/cqrs';
import {
  CrudModule,
  CrudResponsePaginatedDto,
  CrudOperationResolver,
  CrudListQuery,
  CrudReadQuery,
  CrudUpdateCommand,
  CrudDeleteCommand,
} from '@bitwild/rockets-crud';
import { CrudJoin } from '@bitwild/rockets-crud';
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Exclude, Expose, Type as TransformType } from 'class-transformer';

import { RocketsAuthUserUpdateDto } from '../infrastructure/dto/rockets-auth-user-update.dto';
import { RocketsAuthUserDto } from '../infrastructure/dto/rockets-auth-user.dto';
import { AdminGuard } from '../../../guards/admin.guard';
import {
  USER_CRUD_ENTITY_KEY,
  USER_METADATA_MODULE_ENTITY_KEY,
} from '../../../shared/constants/repository-entity-keys.constants';
import { UserCrudOptionsExtrasInterface } from '../../../shared/interfaces/rockets-auth-options-extras.interface';
import { RocketsAuthUserEntityInterface } from '../interfaces/rockets-auth-user-entity.interface';
import { RocketsAuthUserInterface } from '../interfaces/rockets-auth-user.interface';

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
    const ModelDto = admin.model || RocketsAuthUserDto;
    const UpdateDto = admin.dto?.updateOne || RocketsAuthUserUpdateDto;
    const ListHandler = admin.handlers?.adminList ?? AdminUserListHandler;
    const ReadHandler = admin.handlers?.adminRead ?? AdminUserReadHandler;
    const UpdateHandler = admin.handlers?.adminUpdate ?? AdminUpdateUserHandler;
    const DeleteHandler = admin.handlers?.adminDelete ?? AdminDeleteUserHandler;

    @Exclude()
    class AdminUsersPaginatedDto extends CrudResponsePaginatedDto<RocketsAuthUserInterface> {
      @Expose()
      @ApiProperty({
        type: ModelDto,
        isArray: true,
        description: 'Array of Users',
      })
      @TransformType(() => ModelDto)
      data: RocketsAuthUserInterface[] = [];
    }

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
              response: {
                resource: ModelDto,
                paginated: AdminUsersPaginatedDto,
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
                request: { body: UpdateDto },
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
