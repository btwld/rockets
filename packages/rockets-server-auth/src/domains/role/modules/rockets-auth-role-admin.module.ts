import {
  ConfigurableCrudBuilder,
  CrudRequestInterface,
  CrudResponsePaginatedDto,
} from '@concepta/nestjs-crud';
import {
  DynamicModule,
  Module,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RocketsAuthRoleUpdateDto } from '../dto/rockets-auth-role-update.dto';
import { RocketsAuthRoleDto } from '../dto/rockets-auth-role.dto';
import { AdminGuard } from '../../../guards/admin.guard';
import { RoleCrudOptionsExtrasInterface } from '../../../shared/interfaces/rockets-auth-options-extras.interface';
import { ADMIN_ROLE_CRUD_SERVICE_TOKEN } from '../../../shared/constants/rockets-auth.constants';

import { Exclude, Expose, Type } from 'class-transformer';
import { RocketsAuthRoleCreatableInterface } from '../interfaces/rockets-auth-role-creatable.interface';
import { RocketsAuthRoleEntityInterface } from '../interfaces/rockets-auth-role-entity.interface';
import { RocketsAuthRoleUpdatableInterface } from '../interfaces/rockets-auth-role-updatable.interface';
import { RocketsAuthRoleInterface } from '../interfaces/rockets-auth-role.interface';
import { AdminUserRolesController } from '../controllers/admin-user-roles.controller';
import { RocketsAuthRoleCreateDto } from '../dto/rockets-auth-role-create.dto';

@Module({})
export class RocketsAuthRoleAdminModule {
  static register(admin: RoleCrudOptionsExtrasInterface): DynamicModule {
    const ModelDto = admin.model || RocketsAuthRoleDto;
    const UpdateDto = admin.dto?.updateOne || RocketsAuthRoleUpdateDto;
    const CreateDto = admin.dto?.createOne || RocketsAuthRoleCreateDto;

    @Exclude()
    class PaginatedDto extends CrudResponsePaginatedDto<RocketsAuthRoleInterface> {
      @Expose()
      @ApiProperty({
        type: ModelDto,
        isArray: true,
        description: 'Array of Roles',
      })
      @Type(() => ModelDto)
      data: RocketsAuthRoleInterface[] = [];
    }

    const builder = new ConfigurableCrudBuilder<
      RocketsAuthRoleEntityInterface,
      RocketsAuthRoleCreatableInterface,
      RocketsAuthRoleUpdatableInterface
    >({
      service: {
        adapter: admin.adapter,
        injectionToken: ADMIN_ROLE_CRUD_SERVICE_TOKEN,
      },
      controller: {
        path: admin.path || 'admin/roles',
        model: {
          type: ModelDto,
          paginatedType: PaginatedDto,
        },
        extraDecorators: [
          ApiTags('admin'),
          UseGuards(AdminGuard),
          ApiBearerAuth(),
        ],
      },
      getMany: {},
      getOne: {},
      createOne: {
        dto: CreateDto,
      },
      updateOne: {
        dto: UpdateDto,
      },
      deleteOne: {},
    });

    const {
      ConfigurableControllerClass,
      ConfigurableServiceClass,
      CrudUpdateOne,
    } = builder.build();

    class AdminRoleCrudService extends ConfigurableServiceClass {}

    class AdminRoleCrudController extends ConfigurableControllerClass {
      /**
       * Override updateOne to add validation
       */
      @CrudUpdateOne
      @ApiOperation({
        summary: 'Update role',
        description: 'Updates role information',
      })
      @ApiParam({
        name: 'id',
        required: true,
        description: 'Role id',
        schema: { type: 'string' },
      })
      @ApiBody({
        type: UpdateDto,
        description: 'Role information to update',
      })
      @ApiOkResponse({
        description: 'Role updated successfully',
        type: ModelDto,
      })
      @ApiResponse({
        status: 400,
        description: 'Bad request - Invalid input data',
      })
      @ApiResponse({
        status: 401,
        description: 'Unauthorized - User not authenticated',
      })
      async updateOne(
        crudRequest: CrudRequestInterface<RocketsAuthRoleEntityInterface>,
        updateDto: InstanceType<typeof UpdateDto>,
      ) {
        const pipe = new ValidationPipe({
          transform: true,
          skipMissingProperties: true,
          forbidUnknownValues: true,
        });
        await pipe.transform(updateDto, { type: 'body', metatype: UpdateDto });

        return super.updateOne(crudRequest, updateDto);
      }
    }

    return {
      module: RocketsAuthRoleAdminModule,
      imports: [...(admin.imports || [])],
      controllers: [AdminRoleCrudController, AdminUserRolesController],
      providers: [
        admin.adapter,
        AdminRoleCrudService,
        {
          provide: ADMIN_ROLE_CRUD_SERVICE_TOKEN,
          useClass: AdminRoleCrudService,
        },
      ],
      exports: [AdminRoleCrudService, admin.adapter],
    };
  }
}
