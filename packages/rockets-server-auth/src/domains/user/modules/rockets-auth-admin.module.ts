import {
  ConfigurableCrudBuilder,
  CrudRequestInterface,
  CrudResponsePaginatedDto,
  CrudRelationRegistry,
  CrudService,
  CrudAdapter,
} from '@concepta/nestjs-crud';
import {
  DynamicModule,
  Module,
  UseGuards,
  ValidationPipe,
  applyDecorators,
  Inject,
  BadRequestException,
  HttpException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { UserMetadataCrudService } from './rockets-auth-user-metadata.module';
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { RocketsAuthUserUpdateDto } from '../dto/rockets-auth-user-update.dto';
import { RocketsAuthUserDto } from '../dto/rockets-auth-user.dto';
import { AdminGuard } from '../../../guards/admin.guard';
import { UserCrudOptionsExtrasInterface } from '../../../shared/interfaces/rockets-auth-options-extras.interface';
import {
  ADMIN_USER_CRUD_SERVICE_TOKEN,
  ROCKETS_ADMIN_USER_RELATION_REGISTRY,
} from '../../../shared/constants/rockets-auth.constants';

import { Exclude, Expose, Type, plainToInstance } from 'class-transformer';
import { RocketsAuthUserCreatableInterface } from '../interfaces/rockets-auth-user-creatable.interface';
import { RocketsAuthUserEntityInterface } from '../interfaces/rockets-auth-user-entity.interface';
import { RocketsAuthUserUpdatableInterface } from '../interfaces/rockets-auth-user-updatable.interface';
import { RocketsAuthUserMetadataEntityInterface } from '../interfaces/rockets-auth-user-metadata-entity.interface';
import { RocketsAuthUserInterface } from '../interfaces/rockets-auth-user.interface';
import { GenericUserMetadataModelService } from '../services/rockets-auth-user-metadata.model.service';
import { UserMetadataModelService } from '../constants/user-metadata.constants';
import { CrudApiParam } from '@concepta/nestjs-crud';
import { logAndGetErrorDetails } from '../../../shared/utils/error-logging.helper';
import { CrudRelations } from '../../../shared/compat/concepta-internals';
import {
  EntityManager,
  EntityTarget,
  FindOptionsWhere,
  Repository,
} from 'typeorm';

@Module({})
export class RocketsAuthAdminModule {
  static register(admin: UserCrudOptionsExtrasInterface): DynamicModule {
    const ModelDto = admin.model || RocketsAuthUserDto;
    const UpdateDto = admin.dto?.updateOne || RocketsAuthUserUpdateDto;
    @Exclude()
    class PaginatedDto extends CrudResponsePaginatedDto<RocketsAuthUserInterface> {
      @Expose()
      @ApiProperty({
        type: ModelDto,
        isArray: true,
        description: 'Array of Orgs',
      })
      @Type(() => ModelDto)
      data: RocketsAuthUserInterface[] = [];
    }

    // Note: UserMetadataCrudService is now provided by the centralized RocketsAuthUserMetadataModule

    const builder = new ConfigurableCrudBuilder<
      RocketsAuthUserEntityInterface,
      RocketsAuthUserCreatableInterface,
      RocketsAuthUserUpdatableInterface
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
      getMany: {},
      getOne: {},
      updateOne: {
        dto: UpdateDto,
        extraDecorators: [
          applyDecorators(
            CrudApiParam({
              name: 'id',
              required: true,
              description: 'User id',
            }),
          ),
        ],
      },
    });

    const { ConfigurableControllerClass } = builder.build();

    // Relation-aware Admin User CrudService that extends CrudService directly
    // with proper generic types for relations
    // CrudRelations handles metadata queries, but create/update require manual handling
    class AdminUserCrudService extends CrudService<
      RocketsAuthUserEntityInterface,
      [RocketsAuthUserMetadataEntityInterface]
    > {
      private readonly logger = new Logger(AdminUserCrudService.name);

      constructor(
        @Inject(admin.adapter)
        protected readonly crudAdapter: CrudAdapter<RocketsAuthUserEntityInterface>,
        @Inject(ROCKETS_ADMIN_USER_RELATION_REGISTRY)
        protected readonly relationRegistry: CrudRelationRegistry<
          RocketsAuthUserEntityInterface,
          [RocketsAuthUserMetadataEntityInterface]
        >,
        @Inject(UserMetadataModelService)
        private readonly userMetadataModelService: GenericUserMetadataModelService,
      ) {
        super(crudAdapter, relationRegistry);
      }

      async updateOne(
        req: CrudRequestInterface<RocketsAuthUserEntityInterface>,
        dto:
          | RocketsAuthUserEntityInterface
          | Partial<RocketsAuthUserEntityInterface>,
      ): Promise<RocketsAuthUserEntityInterface> {
        // Extract userMetadata from DTO if present
        const { userMetadata, ...userDto } = dto;

        // Validate metadata if provided
        if (
          userMetadata &&
          Object.keys(userMetadata).length > 0 &&
          admin.userMetadataConfig
        ) {
          const MetadataDto = admin.userMetadataConfig.updateDto;
          const metadataInstance = plainToInstance(MetadataDto, userMetadata);

          const pipe = new ValidationPipe({
            transform: true,
            whitelist: true,
            forbidNonWhitelisted: false,
            forbidUnknownValues: true,
          });

          try {
            await pipe.transform(metadataInstance, {
              type: 'body',
              metatype: MetadataDto,
            });
          } catch (error: unknown) {
            const message =
              error instanceof Error ? error.message : 'Invalid metadata';
            throw new BadRequestException(message);
          }
        }

        // Transaction path is preferred when both adapters expose TypeORM repositories
        // tied to the same manager. This gives atomic user + metadata writes.
        const canUseTransactionalPath =
          this.canUseTransactionalMetadataUpdate();
        if (userMetadata && canUseTransactionalPath) {
          return this.updateOneWithMetadataTransaction(
            req,
            userDto,
            userMetadata,
          );
        }

        // Fallback path keeps compatibility for non-TypeORM adapters or deployments
        // where repositories are not transaction-capable. This path is strong-failure
        // (request errors on metadata failure) but not guaranteed atomic.
        const result = await super.updateOne(req, userDto);

        // Manually create/update metadata using userMetadataService
        if (userMetadata) {
          try {
            await this.userMetadataModelService.createOrUpdate(
              result.id,
              userMetadata,
            );
          } catch (metadataError: unknown) {
            if (metadataError instanceof HttpException) {
              throw metadataError;
            }

            logAndGetErrorDetails(
              metadataError,
              this.logger,
              'Failed to update user metadata',
              { userId: result.id, errorId: 'ADMIN_METADATA_UPDATE_FAILED' },
            );

            throw new InternalServerErrorException(
              'Failed to update user metadata',
            );
          }
        }

        // CrudRelations will fetch the complete user with metadata
        const updatedUser = await super.getOne(req);
        return updatedUser;
      }

      private async updateOneWithMetadataTransaction(
        req: CrudRequestInterface<RocketsAuthUserEntityInterface>,
        userDto: Partial<RocketsAuthUserEntityInterface>,
        userMetadata: unknown,
      ): Promise<RocketsAuthUserEntityInterface> {
        const userRepo =
          this.extractTypeOrmRepository<RocketsAuthUserEntityInterface>(
            this.crudAdapter,
          );
        const metadataRepo =
          this.extractTypeOrmRepository<RocketsAuthUserMetadataEntityInterface>(
            this.userMetadataModelService.repo,
          );

        if (!userRepo || !metadataRepo) {
          // Defensive fallback. This should be unreachable because caller gates with
          // canUseTransactionalMetadataUpdate, but keep behavior safe if wiring changes.
          const result = await super.updateOne(req, userDto);
          await this.userMetadataModelService.createOrUpdate(
            result.id,
            userMetadata as Record<string, unknown>,
          );
          return super.getOne(req);
        }

        const existingUser = await super.getOne(req);

        try {
          await userRepo.manager.transaction(async (manager: EntityManager) => {
            const txUserRepo = manager.getRepository(
              userRepo.target as EntityTarget<RocketsAuthUserEntityInterface>,
            );
            const txMetadataRepo = manager.getRepository(
              metadataRepo.target as EntityTarget<RocketsAuthUserMetadataEntityInterface>,
            );

            // Keep id authoritative from the route lookup to avoid accidental reassignment.
            await txUserRepo.save({
              id: existingUser.id,
              ...userDto,
            });

            const existingMetadata = await txMetadataRepo.findOne({
              where: {
                userId: existingUser.id,
              } as FindOptionsWhere<RocketsAuthUserMetadataEntityInterface>,
            });

            if (existingMetadata) {
              await txMetadataRepo.save({
                ...existingMetadata,
                ...(userMetadata as Record<string, unknown>),
                id: existingMetadata.id,
                userId: existingUser.id,
              });
            } else {
              await txMetadataRepo.save({
                ...(userMetadata as Record<string, unknown>),
                userId: existingUser.id,
              });
            }
          });
        } catch (metadataError: unknown) {
          if (metadataError instanceof HttpException) {
            throw metadataError;
          }

          logAndGetErrorDetails(
            metadataError,
            this.logger,
            'Failed to update user metadata',
            {
              userId: existingUser.id,
              errorId: 'ADMIN_METADATA_UPDATE_FAILED',
            },
          );

          throw new InternalServerErrorException(
            'Failed to update user metadata',
          );
        }

        return super.getOne(req);
      }

      private canUseTransactionalMetadataUpdate(): boolean {
        const userRepo =
          this.extractTypeOrmRepository<RocketsAuthUserEntityInterface>(
            this.crudAdapter,
          );
        const metadataRepo =
          this.extractTypeOrmRepository<RocketsAuthUserMetadataEntityInterface>(
            this.userMetadataModelService.repo,
          );

        if (!userRepo || !metadataRepo) {
          return false;
        }

        return this.getManagerIdentity(userRepo.manager) ===
          this.getManagerIdentity(metadataRepo.manager)
          ? true
          : false;
      }

      private getManagerIdentity(manager: EntityManager): string {
        const dataSource = (
          manager as unknown as { dataSource?: { name?: string } }
        ).dataSource;
        const connection = (
          manager as unknown as { connection?: { name?: string } }
        ).connection;
        return dataSource?.name || connection?.name || '';
      }

      private extractTypeOrmRepository<T extends object>(
        adapterLike: unknown,
      ): Repository<T> | null {
        if (!adapterLike || typeof adapterLike !== 'object') {
          return null;
        }

        const candidate = (adapterLike as { repo?: unknown }).repo;
        if (!candidate || typeof candidate !== 'object') {
          return null;
        }

        const repository = candidate as Partial<Repository<T>>;
        if (
          typeof repository.findOne !== 'function' ||
          typeof repository.save !== 'function' ||
          !repository.manager ||
          !repository.target
        ) {
          return null;
        }

        return repository as Repository<T>;
      }
    }

    // Controller extends ConfigurableControllerClass and delegates to service
    class AdminUserCrudController extends ConfigurableControllerClass {}

    return {
      module: RocketsAuthAdminModule,
      imports: [...(admin.imports || [])],
      controllers: [AdminUserCrudController],
      providers: [
        admin.adapter,
        // Note: UserMetadataCrudService and metadata adapter are now provided by RocketsAuthUserMetadataModule
        {
          provide: ROCKETS_ADMIN_USER_RELATION_REGISTRY,
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
