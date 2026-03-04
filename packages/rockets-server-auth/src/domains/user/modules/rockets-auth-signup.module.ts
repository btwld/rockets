import {
  PasswordPlainInterface,
  RuntimeException,
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
  forwardRef,
  Inject,
  InternalServerErrorException,
  Logger,
  Module,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  SIGNUP_USER_CRUD_SERVICE_TOKEN,
  ROCKETS_SIGNUP_USER_RELATION_REGISTRY,
  ROCKETS_AUTH_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN,
} from '../../../shared/constants/rockets-auth.constants';
import { UserCrudOptionsExtrasInterface } from '../../../shared/interfaces/rockets-auth-options-extras.interface';
import { RocketsAuthUserCreateDto } from '../dto/rockets-auth-user-create.dto';
import { RocketsAuthUserDto } from '../dto/rockets-auth-user.dto';
import { CrudRelations } from '../../../shared/compat/concepta-internals';

import { AuthPublic } from '@concepta/nestjs-authentication';
import { UserModelService } from '@concepta/nestjs-user';
import { RocketsAuthUserCreatableInterface } from '../interfaces/rockets-auth-user-creatable.interface';
import { RocketsAuthUserEntityInterface } from '../interfaces/rockets-auth-user-entity.interface';
import { UserMetadataModelService } from '../constants/user-metadata.constants';
import { RocketsAuthUserMetadataEntityInterface } from '../interfaces/rockets-auth-user-metadata-entity.interface';
import { GenericUserMetadataModelService } from '../services/rockets-auth-user-metadata.model.service';
import { UserMetadataCrudService } from './rockets-auth-user-metadata.module';
import { RocketsAuthSettingsInterface } from '../../../shared/interfaces/rockets-auth-settings.interface';
import { RocketsAuthRoleService } from '../../role/services/rockets-auth-role.service';

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
      private readonly logger = new Logger(SignupCrudService.name);

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
        @Inject(UserMetadataModelService)
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
        if (dto.username || dto.email) {
          const existingUser = await this.userModelService.find({
            where: [
              ...(dto.username ? [{ username: dto.username }] : []),
              ...(dto.email ? [{ email: dto.email }] : []),
            ],
          });

          if (existingUser?.length) {
            throw new BadRequestException(
              'User with this username or email already exists',
            );
          }
        }

        let passwordHash = {};
        if (dto.password) {
          passwordHash = await this.passwordCreationService.create(
            dto.password,
          );
        }

        const { userMetadata: nested, ...rootDto } = dto;

        const created = await super.createOne(req, {
          ...rootDto,
          ...passwordHash,
        });

        let userMetadata;
        if (nested) {
          try {
            // Strip id and userId from the payload to prevent saving with incorrect values
            const { id, userId, ...safeMetadata } = nested;

            if (id || userId) {
              this.logger.warn(
                'Ignoring id and userId from metadata payload during signup',
              );
            }

            userMetadata = await this.metadataModelService.createOrUpdate(
              created.id,
              safeMetadata,
            );
          } catch (metadataError) {
            // Log the error with full context for debugging
            this.logger.error('Failed to create user metadata during signup', {
              userId: created.id,
              error: metadataError,
            });

            // Rollback: delete the created user to maintain data consistency
            try {
              await this.userModelService.remove({ id: created.id });
              this.logger.debug(
                'Rolled back user creation after metadata failure',
                {
                  userId: created.id,
                },
              );
            } catch (rollbackError) {
              this.logger.error('Failed to rollback user creation', {
                userId: created.id,
                error: rollbackError,
              });
            }

            // If it's a known HTTP exception (validation, bad request, etc.), rethrow it
            if (metadataError instanceof RuntimeException) {
              throw metadataError;
            }

            // Otherwise, throw a generic internal server error
            throw new InternalServerErrorException(
              'Failed to complete signup. Please try again.',
            );
          }
        }

        await this.authRoleService.assignDefaultRoleToUser(created.id, false);
        return {
          ...created,
          userMetadata,
        };
      }
    }
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
      imports: [...(admin.imports || [])],
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
