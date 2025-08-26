import { UserCreatableInterface } from '@concepta/nestjs-common';
import {
  ConfigurableCrudBuilder,
  CrudRequestInterface,
} from '@concepta/nestjs-crud';
import { PasswordCreationService } from '@concepta/nestjs-password';
import { DynamicModule, Inject, Module, ValidationPipe } from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { RocketsServerUserCreateDto } from '../../dto/user/rockets-server-user-create.dto';
import { RocketsServerUserDto } from '../../dto/user/rockets-server-user.dto';
import { UserCrudOptionsExtrasInterface } from '../../interfaces/rockets-server-options-extras.interface';
import { ADMIN_USER_CRUD_SERVICE_TOKEN } from '../../rockets-server.constants';

import { AuthPublic } from '@concepta/nestjs-authentication';
import { RocketsServerUserCreatableInterface } from '../../interfaces/user/rockets-server-user-creatable.interface';
import { RocketsServerUserEntityInterface } from '../../interfaces/user/rockets-server-user-entity.interface';
@Module({})
export class RocketsServerSignUpModule {
  static register(admin: UserCrudOptionsExtrasInterface): DynamicModule {
    const ModelDto = admin.model || RocketsServerUserDto;
    const CreateDto = admin.dto?.createOne || RocketsServerUserCreateDto;
    const builder = new ConfigurableCrudBuilder<
      RocketsServerUserEntityInterface,
      RocketsServerUserCreatableInterface,
      RocketsServerUserCreatableInterface
    >({
      service: {
        adapter: admin.adapter,
        injectionToken: ADMIN_USER_CRUD_SERVICE_TOKEN,
      },
      controller: {
        path: admin.path || 'signup',
        model: {
          type: ModelDto,
        },
        extraDecorators: [ApiTags('auth')],
      },
      createOne: {
        dto: CreateDto,
      },
    });

    const {
      ConfigurableControllerClass,
      ConfigurableServiceClass,
      CrudCreateOne,
    } = builder.build();

    class SignupCrudService extends ConfigurableServiceClass {}
    // TODO: add decorators and option to overwrite or disable controller
    class SignupCrudController extends ConfigurableControllerClass {
      constructor(
        @Inject(ADMIN_USER_CRUD_SERVICE_TOKEN)
        private readonly userCrudService: SignupCrudService,
        @Inject(PasswordCreationService)
        protected readonly passwordCreationService: PasswordCreationService,
      ) {
        super(userCrudService);
      }

      @AuthPublic()
      @ApiOperation({
        summary: 'Create a new user account',
        description:
          'Registers a new user in the system with email, username and password',
      })
      @ApiBody({
        type: CreateDto,
        description: 'User registration information',
        examples: {
          standard: {
            value: {
              email: 'user@example.com',
              username: 'user@example.com',
              password: 'StrongP@ssw0rd',
              active: true,
            },
            summary: 'Standard user registration',
          },
        },
      })
      @ApiCreatedResponse({
        description: 'User created successfully',
        type: ModelDto,
      })
      @CrudCreateOne
      async createOne(
        crudRequest: CrudRequestInterface<UserCreatableInterface>,
        dto: InstanceType<typeof CreateDto>,
      ) {
        const pipe = new ValidationPipe({
          transform: true,
          forbidUnknownValues: true,
        });
        await pipe.transform(dto, { type: 'body', metatype: CreateDto });

        const passwordHash = await this.passwordCreationService.create(
          dto.password,
        );

        return super.createOne(crudRequest, {
          ...dto,
          ...passwordHash,
        });
      }
    }

    return {
      module: RocketsServerSignUpModule,
      imports: [...(admin.imports || [])],
      controllers: [SignupCrudController],
      providers: [
        admin.adapter,
        SignupCrudService,
        {
          provide: ADMIN_USER_CRUD_SERVICE_TOKEN,
          useClass: SignupCrudService,
        },
      ],
      exports: [SignupCrudService, admin.adapter],
    };
  }
}
