import { AuthJwtGuard } from '@concepta/nestjs-auth-jwt';
import { AuthUser } from '@concepta/nestjs-authentication';
import {
  ConfigurableCrudBuilder,
  CrudReadOne,
  CrudRequest,
  CrudRequestInterface,
  CrudUpdateOne,
} from '@concepta/nestjs-crud';
import {
  DynamicModule,
  Module,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import { RocketsServerAuthUserUpdateDto } from '../../dto/user/rockets-server-auth-user-update.dto';
import { RocketsServerAuthUserDto } from '../../dto/user/rockets-server-auth-user.dto';
import { UserCrudOptionsExtrasInterface } from '../../interfaces/rockets-server-auth-options-extras.interface';
import { ADMIN_USER_CRUD_SERVICE_TOKEN } from '../../rockets-server-auth.constants';

import { ApiOkResponse, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { RocketsServerAuthUserCreatableInterface } from '../../interfaces/user/rockets-server-auth-user-creatable.interface';
import { RocketsServerAuthUserEntityInterface } from '../../interfaces/user/rockets-server-auth-user-entity.interface';
import { RocketsServerAuthUserUpdatableInterface } from '../../interfaces/user/rockets-server-auth-user-updatable.interface';
@Module({})
export class RocketsServerAuthUserModule {
  static register(admin: UserCrudOptionsExtrasInterface): DynamicModule {
    const UpdateDto = admin.dto?.updateOne || RocketsServerAuthUserUpdateDto;
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
        path: admin.path || 'user',
        model: {
          type: admin.model || RocketsServerAuthUserDto,
        },
        extraDecorators: [
          ApiTags('user'),
          UseGuards(AuthJwtGuard),
          ApiBearerAuth(),
        ],
      },
      getOne: {},
      updateOne: {
        dto: UpdateDto,
      },
    });

    const { ConfigurableControllerClass, ConfigurableServiceClass } =
      builder.build();

    class UserCrudService extends ConfigurableServiceClass {}
    // TODO: add decorators and option to overwrite or disable controller

    class UserCrudController extends ConfigurableControllerClass {
      /**
       * Override getOne to automatically use authenticated user's ID
       */

      @CrudReadOne({
        path: '',
      })
      @ApiOperation({
        summary: 'Get current user profile',
        description:
          'Retrieves the currently authenticated user profile information',
      })
      @ApiOkResponse({
        description: 'User profile retrieved successfully',
        type: admin.model || RocketsServerAuthUserDto,
      })
      @ApiResponse({
        status: 401,
        description: 'Unauthorized - User not authenticated',
      })
      async getOne(
        @CrudRequest()
        crudRequest: CrudRequestInterface<RocketsServerAuthUserEntityInterface>,
        @AuthUser('id') authId: string,
      ) {
        const modifiedRequest: CrudRequestInterface<RocketsServerAuthUserEntityInterface> =
          {
            ...crudRequest,
            parsed: {
              ...crudRequest.parsed,
              paramsFilter: [{ field: 'id', operator: '$eq', value: authId }],
              search: {
                $and: [
                  {
                    id: {
                      $eq: authId,
                    },
                  },
                ],
              },
            },
          };
        return super.getOne(modifiedRequest);
      }

      /**
       * Override updateOne to automatically use authenticated user's ID
       */
      @CrudUpdateOne({
        path: '',
      })
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
        type: admin.model || RocketsServerAuthUserDto,
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
        @CrudRequest()
        crudRequest: CrudRequestInterface<RocketsServerAuthUserEntityInterface>,
        updateDto: InstanceType<typeof UpdateDto>,
        @AuthUser('id') authId: string,
      ) {
        const pipe = new ValidationPipe({
          transform: true,
          skipMissingProperties: true,
          forbidUnknownValues: true,
        });
        await pipe.transform(updateDto, { type: 'body', metatype: UpdateDto });

        // Create a new request with the authenticated user's ID
        const modifiedRequest: CrudRequestInterface<RocketsServerAuthUserEntityInterface> =
          {
            ...crudRequest,
            parsed: {
              ...crudRequest.parsed,
              paramsFilter: [{ field: 'id', operator: '$eq', value: authId }],
              search: {
                $and: [
                  {
                    id: {
                      $eq: authId,
                    },
                  },
                ],
              },
            },
          };
        return super.updateOne(modifiedRequest, updateDto);
      }
    }

    return {
      module: RocketsServerAuthUserModule,
      imports: [...(admin.imports || [])],
      controllers: [UserCrudController],
      providers: [
        admin.adapter,
        UserCrudService,
        {
          provide: ADMIN_USER_CRUD_SERVICE_TOKEN,
          useClass: UserCrudService,
        },
      ],
      exports: [UserCrudService, admin.adapter],
    };
  }
}
