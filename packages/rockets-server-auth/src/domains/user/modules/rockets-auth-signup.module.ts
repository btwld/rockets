import {
  PasswordPlainInterface,
  UserCreatableInterface,
} from '@concepta/nestjs-common';
import {
  ConfigurableCrudBuilder,
  CrudAdapter,
  CrudRequestInterface,
  CrudService,
  CrudRelationRegistry,
} from '@concepta/nestjs-crud';
import { PasswordCreationService } from '@concepta/nestjs-password';
import {
  BadRequestException,
  DynamicModule,
  Inject,
  Module,
  ValidationPipe,
  Injectable,
  forwardRef,
  Optional,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  SIGNUP_USER_CRUD_SERVICE_TOKEN,
  ROCKETS_SIGNUP_USER_METADATA_ADAPTER,
  ROCKETS_SIGNUP_USER_RELATION_REGISTRY,
  ROCKETS_AUTH_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN,
} from '../../../shared/constants/rockets-auth.constants';
import { UserCrudOptionsExtrasInterface } from '../../../shared/interfaces/rockets-auth-options-extras.interface';
import { RocketsAuthUserCreateDto } from '../dto/rockets-auth-user-create.dto';
import { RocketsAuthUserDto } from '../dto/rockets-auth-user.dto';
import { CrudRelations } from '@concepta/nestjs-crud/dist/crud/decorators/routes/crud-relations.decorator';

import { AuthPublic } from '@concepta/nestjs-authentication';
import {
  RepositoryInterface,
  getDynamicRepositoryToken,
} from '@concepta/nestjs-common';
import { UserModelService } from '@concepta/nestjs-user';
import {
  AuthUserMetadataModelService,
  AUTH_USER_METADATA_MODULE_ENTITY_KEY,
} from '../constants/user-metadata.constants';
import { RocketsAuthUserMetadataDto } from '../dto/rockets-auth-user-metadata.dto';
import { RocketsAuthUserCreatableInterface } from '../interfaces/rockets-auth-user-creatable.interface';
import { RocketsAuthUserEntityInterface } from '../interfaces/rockets-auth-user-entity.interface';
import { RocketsAuthUserMetadataEntityInterface } from '../interfaces/rockets-auth-user-metadata-entity.interface';
import { GenericUserMetadataModelService } from '../services/rockets-auth-user-metadata.model.service';
import { UserMetadataCrudService } from './rockets-auth-user-metadata.module';
import { TypeOrmExtModule } from '@concepta/nestjs-typeorm-ext';
import { RocketsAuthSettingsInterface } from '../../../shared/interfaces/rockets-auth-settings.interface';
import { RocketsAuthRoleService } from '../../role/services/rockets-auth-role.service';

@Module({})
export class RocketsAuthSignUpModule {
  static register(admin: UserCrudOptionsExtrasInterface): DynamicModule {
    const ModelDto = admin.model || RocketsAuthUserDto;
    const CreateDto = admin.dto?.createOne || RocketsAuthUserCreateDto;

    // Note: UserMetadataCrudService is now provided by the centralized RocketsAuthUserMetadataModule

    const builder = new ConfigurableCrudBuilder<
      RocketsAuthUserEntityInterface,
      RocketsAuthUserCreatableInterface,
      RocketsAuthUserCreatableInterface
    >({
      service: {
        adapter: admin.adapter,
        injectionToken: SIGNUP_USER_CRUD_SERVICE_TOKEN,
      },
      controller: {
        path: admin.path || 'signup',
        model: {
          type: ModelDto,
        },
        extraDecorators: [
          ApiTags('auth'),
          CrudRelations<
            RocketsAuthUserEntityInterface,
            [RocketsAuthUserMetadataEntityInterface]
          >({
            rootKey: 'id',
            relations: [
              {
                join: 'LEFT',
                cardinality: 'one',
                service: UserMetadataCrudService,
                property: 'userMetadata',
                primaryKey: 'id',
                foreignKey: 'userId',
              },
            ],
          }),
        ],
      },
      createOne: {
        dto: CreateDto,
      },
    });

    const { ConfigurableControllerClass, CrudCreateOne } = builder.build();

    class SignupCrudService extends CrudService<
      RocketsAuthUserEntityInterface,
      [RocketsAuthUserMetadataEntityInterface]
    > {
      constructor(
        @Inject(admin.adapter)
        protected readonly crudAdapter: CrudAdapter<RocketsAuthUserEntityInterface>,
        @Inject(forwardRef(() => ROCKETS_SIGNUP_USER_RELATION_REGISTRY))
        protected readonly relationRegistry: CrudRelationRegistry<
          RocketsAuthUserEntityInterface,
          [RocketsAuthUserMetadataEntityInterface]
        >,
        @Inject(UserModelService)
        private readonly userModelService: UserModelService,
        @Inject(PasswordCreationService)
        private readonly passwordCreationService: PasswordCreationService,
        @Inject(AuthUserMetadataModelService)
        private readonly metadataModelService: GenericUserMetadataModelService,
        @Inject(RocketsAuthRoleService)
        private readonly authRoleService: RocketsAuthRoleService,
        @Inject(ROCKETS_AUTH_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN)
        private readonly settings: RocketsAuthSettingsInterface,
      ) {
        super(crudAdapter, relationRegistry);
      }

      async createOne(
        req: CrudRequestInterface<RocketsAuthUserEntityInterface>,
        dto: RocketsAuthUserEntityInterface & PasswordPlainInterface,
      ): Promise<RocketsAuthUserEntityInterface> {
        const typedDto = dto;

        // Check if user already exists
        if (typedDto.username || typedDto.email) {
          const existingUser = await this.userModelService.find({
            where: [
              ...(typedDto.username ? [{ username: typedDto.username }] : []),
              ...(typedDto.email ? [{ email: typedDto.email }] : []),
            ],
          });

          if (existingUser?.length) {
            throw new BadRequestException(
              'User with this username or email already exists',
            );
          }
        }

        // Hash password if provided
        let passwordHash = {};
        if (typedDto.password) {
          passwordHash = await this.passwordCreationService.create(
            typedDto.password,
          );
        }

        // Extract nested metadata if present
        const { userMetadata: nested, ...rootDto } = typedDto;

        // Create user without metadata
        const created = await super.createOne(req, {
          ...rootDto,
          ...passwordHash,
        });

        // Manually create metadata if provided using userMetadataService
        if (nested) {
          try {
            await this.metadataModelService.createOrUpdate(
              created.id,
              nested,
            );
          } catch (metadataError) {
            // Log error but don't fail signup if metadata creation fails
            console.warn(
              'Failed to create user metadata during signup:',
              metadataError,
            );
          }
        }

        // Assign default role if configured
        // Don't throw error - we don't want to fail signup if role assignment fails
        await this.authRoleService.assignDefaultRoleToUser(created.id, false);

        return created;
      }
    }
    // TODO: add decorators and option to overwrite or disable controller
    class SignupCrudController extends ConfigurableControllerClass {
      @AuthPublic()
      @ApiOperation({
        summary: 'Create a new user account',
        description:
          'Registers a new user in the system with email, username, password and optional metadata',
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
          withMetadata: {
            value: {
              email: 'user@example.com',
              username: 'user@example.com',
              password: 'StrongP@ssw0rd',
              active: true,
              userMetadata: {
                firstName: 'John',
                lastName: 'Doe',
                phone: '+1234567890',
              },
            },
            summary: 'User registration with metadata',
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
        // Validate DTO
        const pipe = new ValidationPipe({
          transform: true,
          forbidUnknownValues: true,
        });
        await pipe.transform(dto, { type: 'body', metatype: CreateDto });

        // Delegate all business logic to service
        return await super.createOne(crudRequest, dto);
      }
    }

    return {
      module: RocketsAuthSignUpModule,
      imports: [
        ...(admin.imports || []),
        // Note: UserMetadata entity registration is now handled by RocketsAuthUserMetadataModule
      ],
      controllers: [SignupCrudController],
      providers: [
        admin.adapter,
        {
          provide: ROCKETS_SIGNUP_USER_RELATION_REGISTRY,
          inject: [UserMetadataCrudService],
          useFactory: (userMetadataCrudService: UserMetadataCrudService) => {
            const registry = new CrudRelationRegistry<
              RocketsAuthUserEntityInterface,
              [RocketsAuthUserMetadataEntityInterface]
            >();
            registry.register(userMetadataCrudService);
            return registry;
          },
        },
        SignupCrudService,
        {
          provide: SIGNUP_USER_CRUD_SERVICE_TOKEN,
          useClass: SignupCrudService,
        },
      ],
      exports: [SignupCrudService, admin.adapter],
    };
  }
}
