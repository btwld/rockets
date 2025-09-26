import { UserCreatableInterface } from '@concepta/nestjs-common';
import {
  ConfigurableCrudBuilder,
  CrudRequestInterface,
} from '@concepta/nestjs-crud';
import { PasswordCreationService } from '@concepta/nestjs-password';
import {
  BadRequestException,
  DynamicModule,
  Inject,
  Module,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { RocketsAuthUserCreateDto } from '../dto/rockets-auth-user-create.dto';
import { RocketsAuthUserDto } from '../dto/rockets-auth-user.dto';
import { UserCrudOptionsExtrasInterface } from '../../../shared/interfaces/rockets-auth-options-extras.interface';
import { ADMIN_USER_CRUD_SERVICE_TOKEN } from '../../../shared/constants/rockets-auth.constants';

import { AuthPublic } from '@concepta/nestjs-authentication';
import { RocketsAuthUserCreatableInterface } from '../interfaces/rockets-auth-user-creatable.interface';
import { RocketsAuthUserEntityInterface } from '../interfaces/rockets-auth-user-entity.interface';
import { UserModelService } from '@concepta/nestjs-user';
@Module({})
export class RocketsAuthSignUpModule {
  static register(admin: UserCrudOptionsExtrasInterface): DynamicModule {
    const ModelDto = admin.model || RocketsAuthUserDto;
    const CreateDto = admin.dto?.createOne || RocketsAuthUserCreateDto;
    const builder = new ConfigurableCrudBuilder<
      RocketsAuthUserEntityInterface,
      RocketsAuthUserCreatableInterface,
      RocketsAuthUserCreatableInterface
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
        @Inject(UserModelService)
        protected readonly userModelService: UserModelService,
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
        try {
          const pipe = new ValidationPipe({
            transform: true,
            forbidUnknownValues: true,
          });
          await pipe.transform(dto, { type: 'body', metatype: CreateDto });

          const existingUser = await this.userModelService.find({
            where: [{ username: dto.username }, { email: dto.email }],
          });

          if (existingUser?.length) {
            throw new BadRequestException(
              'User with this username or email already exists',
            );
          }

          const passwordHash = await this.passwordCreationService.create(
            dto.password,
          );

          return await super.createOne(crudRequest, {
            ...dto,
            ...passwordHash,
          });
        } catch (err) {
          throw err;
        }
      }
    }

    return {
      module: RocketsAuthSignUpModule,
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
