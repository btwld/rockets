import {
  Module,
  Provider,
  Injectable,
  Inject,
  DynamicModule,
  Global,
} from '@nestjs/common';
import { CrudService, CrudAdapter } from '@concepta/nestjs-crud';
import { TypeOrmExtModule } from '@concepta/nestjs-typeorm-ext';
import {
  getDynamicRepositoryToken,
  RepositoryInterface,
} from '@concepta/nestjs-common';

import { RocketsAuthUserMetadataEntityInterface } from '../interfaces/rockets-auth-user-metadata-entity.interface';
import { GenericUserMetadataModelService } from '../services/rockets-auth-user-metadata.model.service';
import {
  AUTH_USER_METADATA_MODULE_ENTITY_KEY,
  AuthUserMetadataModelService,
} from '../constants/user-metadata.constants';
import {
  RocketsAuthUserMetadataModuleClass,
  RAW_USER_METADATA_OPTIONS_TOKEN,
} from './rockets-auth-user-metadata.module-definition';
import { UserMetadataConfigInterface } from '../../../shared/interfaces/rockets-auth-options-extras.interface';

// Adapter token
export const ROCKETS_AUTH_USER_METADATA_ADAPTER =
  'ROCKETS_AUTH_USER_METADATA_ADAPTER';

/**
 * Centralized CRUD Service for UserMetadata
 * This class is exported and used directly by CrudRelations
 * Do NOT use injection token - CrudRelations needs the class itself
 */
@Injectable()
export class UserMetadataCrudService extends CrudService<RocketsAuthUserMetadataEntityInterface> {
  constructor(
    @Inject(ROCKETS_AUTH_USER_METADATA_ADAPTER)
    metadataAdapter: CrudAdapter<RocketsAuthUserMetadataEntityInterface>,
  ) {
    super(metadataAdapter);
  }
}

@Global()
@Module({
  imports: [],
  providers: [],
  exports: [],
})
export class RocketsAuthUserMetadataModule extends RocketsAuthUserMetadataModuleClass {
  static override register(
    options: UserMetadataConfigInterface,
  ): DynamicModule {
    const dynamicModule = super.register(options);

    const providers: Provider[] = [
      ...(dynamicModule.providers || []),

      // Adapter provider
      {
        provide: ROCKETS_AUTH_USER_METADATA_ADAPTER,
        useClass: options.adapter,
      },

      // Exported CRUD class - used by CrudRelations
      UserMetadataCrudService,

      // Global AuthUserMetadataModelService - can be overridden
      {
        provide: AuthUserMetadataModelService,
        useFactory: (
          repo: RepositoryInterface<RocketsAuthUserMetadataEntityInterface>,
          config: UserMetadataConfigInterface,
        ) => {
          // Use custom service if provided in config
          if (config.userMetadataModelService) {
            return new config.userMetadataModelService(
              repo,
              config.createDto,
              config.updateDto,
            );
          }

          // Otherwise, use the default service
          return new GenericUserMetadataModelService(
            repo,
            config.createDto,
            config.updateDto,
          );
        },
        inject: [
          getDynamicRepositoryToken(AUTH_USER_METADATA_MODULE_ENTITY_KEY),
          RAW_USER_METADATA_OPTIONS_TOKEN,
        ],
      },
    ];

    return {
      ...dynamicModule,
      imports: [
        ...(dynamicModule.imports || []),
        // Additional imports from config (e.g., for test fixtures)
        ...(options.imports || []),
        // Registers entity for dynamic repository - REQUIRED
        TypeOrmExtModule.forFeature({
          [AUTH_USER_METADATA_MODULE_ENTITY_KEY]: {
            entity: options.entity,
          },
        }),
      ],
      providers,
      exports: [
        ...(dynamicModule.exports || []),
        UserMetadataCrudService, // Exports class for CrudRelations
        AuthUserMetadataModelService, // Exports for injection listener
        ROCKETS_AUTH_USER_METADATA_ADAPTER,
      ],
    };
  }

  static override registerAsync(
    options: UserMetadataAsyncOptionsInterface,
  ): DynamicModule {
    const dynamicModule = super.registerAsync(options);

    // Similar logic for async registration
    const providers: Provider[] = [
      ...(dynamicModule.providers || []),

      // Adapter provider - async
      {
        provide: ROCKETS_AUTH_USER_METADATA_ADAPTER,
        useFactory: options.useFactory,
        inject: options.inject || [],
      },

      // CRUD class
      UserMetadataCrudService,

      // AuthUserMetadataModelService - async
      {
        provide: AuthUserMetadataModelService,
        useFactory: async (
          repo: RepositoryInterface<RocketsAuthUserMetadataEntityInterface>,
          config: UserMetadataConfigInterface,
        ) => {
          if (config.userMetadataModelService) {
            return new config.userMetadataModelService(
              repo,
              config.createDto,
              config.updateDto,
            );
          }
          return new GenericUserMetadataModelService(
            repo,
            config.createDto,
            config.updateDto,
          );
        },
        inject: [
          getDynamicRepositoryToken(AUTH_USER_METADATA_MODULE_ENTITY_KEY),
          RAW_USER_METADATA_OPTIONS_TOKEN,
        ],
      },
    ];

    return {
      ...dynamicModule,
      imports: [
        ...(dynamicModule.imports || []),
        // Note: For async, additional imports would need to be handled differently
        // Currently, only sync register() supports additional imports
      ],
      providers,
      exports: [
        ...(dynamicModule.exports || []),
        UserMetadataCrudService,
        AuthUserMetadataModelService,
        ROCKETS_AUTH_USER_METADATA_ADAPTER,
      ],
    };
  }
}
