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
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RocketsServerAuthUserUpdateDto } from '../../dto/user/rockets-server-auth-user-update.dto';
import { RocketsServerAuthUserDto } from '../../dto/user/rockets-server-auth-user.dto';
import { AdminGuard } from '../../guards/admin.guard';
import { UserCrudOptionsExtrasInterface } from '../../interfaces/rockets-server-auth-options-extras.interface';
import { ADMIN_USER_CRUD_SERVICE_TOKEN } from '../../rockets-server-auth.constants';

import { Exclude, Expose, Type } from 'class-transformer';
import { RocketsServerAuthUserCreatableInterface } from '../../interfaces/user/rockets-server-auth-user-creatable.interface';
import { RocketsServerAuthUserEntityInterface } from '../../interfaces/user/rockets-server-auth-user-entity.interface';
import { RocketsServerAuthUserUpdatableInterface } from '../../interfaces/user/rockets-server-auth-user-updatable.interface';
import { RocketsServerAuthUserInterface } from '../../interfaces/user/rockets-server-auth-user.interface';
@Module({})
export class RocketsServerAuthAdminModule {
  static register(admin: UserCrudOptionsExtrasInterface): DynamicModule {
    const ModelDto = admin.model || RocketsServerAuthUserDto;
    const UpdateDto = admin.dto?.updateOne || RocketsServerAuthUserUpdateDto;
    @Exclude()
    class PaginatedDto extends CrudResponsePaginatedDto<RocketsServerAuthUserInterface> {
      @Expose()
      @ApiProperty({
        type: ModelDto,
        isArray: true,
        description: 'Array of Orgs',
      })
      @Type(() => ModelDto)
      data: RocketsServerAuthUserInterface[] = [];
    }

    const builder = new ConfigurableCrudBuilder<
      RocketsServerAuthUserEntityInterface,
      RocketsServerAuthUserCreatableInterface,
      RocketsServerAuthUserUpdatableInterface
    >({
      service: {
        adapter: admin.adapter,
        injectionToken: ADMIN_USER_CRUD_SERVICE_TOKEN,
      },
      controller: {
        path: admin.path || 'admin/users',
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
      updateOne: {
        dto: UpdateDto,
      },
    });

    const {
      ConfigurableControllerClass,
      ConfigurableServiceClass,
      CrudUpdateOne,
    } = builder.build();

    class AdminUserCrudService extends ConfigurableServiceClass {}
    // TODO: add decorators and option to overwrite or disable controller
    class AdminUserCrudController extends ConfigurableControllerClass {
      /**
       * Override updateOne to automatically use authenticated user's ID
       */
      @CrudUpdateOne
      @ApiOperation({
        summary: 'Update current user profile',
        description:
          'Updates the currently authenticated user profile information',
      })
      @ApiBody({
        type: UpdateDto,
        description: 'User profile information to update',
      })
      @ApiOkResponse({
        description: 'User profile updated successfully',
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
        crudRequest: CrudRequestInterface<RocketsServerAuthUserEntityInterface>,
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
      module: RocketsServerAuthAdminModule,
      imports: [...(admin.imports || [])],
      controllers: [AdminUserCrudController],
      providers: [
        admin.adapter,
        AdminUserCrudService,
        {
          provide: ADMIN_USER_CRUD_SERVICE_TOKEN,
          useClass: AdminUserCrudService,
        },
      ],
      exports: [AdminUserCrudService, admin.adapter],
    };
  }
}
