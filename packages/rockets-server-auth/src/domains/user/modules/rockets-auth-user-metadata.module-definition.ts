import {
  ConfigurableModuleBuilder,
  DynamicModule,
  Provider,
} from '@nestjs/common';
import { CrudService, CrudAdapter } from '@concepta/nestjs-crud';
import {
  getDynamicRepositoryToken,
  RepositoryInterface,
} from '@concepta/nestjs-common';
import { UserMetadataConfigInterface } from '../../../shared/interfaces/rockets-auth-options-extras.interface';
import { RocketsAuthUserMetadataEntityInterface } from '../interfaces/rockets-auth-user-metadata-entity.interface';
import { GenericUserMetadataModelService } from '../services/rockets-auth-user-metadata.model.service';
import {
  USER_METADATA_MODULE_ENTITY_KEY,
  UserMetadataModelService,
} from '../constants/user-metadata.constants';

export const RAW_USER_METADATA_OPTIONS_TOKEN = Symbol(
  '__ROCKETS_USER_METADATA_MODULE_RAW_OPTIONS_TOKEN__',
);

// Adapter token - moved here for consistency
export const ROCKETS_USER_METADATA_ADAPTER = 'ROCKETS_USER_METADATA_ADAPTER';

/**
 * Centralized CRUD Service for UserMetadata
 * This class is exported and used directly by CrudRelations
 * Do NOT use injection token - CrudRelations needs the class itself
 */
export class UserMetadataCrudService extends CrudService<RocketsAuthUserMetadataEntityInterface> {
  constructor(
    metadataAdapter: CrudAdapter<RocketsAuthUserMetadataEntityInterface>,
  ) {
    super(metadataAdapter);
  }
}

type UserMetadataExtrasInterface = UserMetadataConfigInterface & {
  global?: boolean;
};

export const {
  ConfigurableModuleClass: RocketsAuthUserMetadataModuleClass,
  OPTIONS_TYPE: ROCKETS_AUTH_USER_METADATA_MODULE_OPTIONS_TYPE,
  ASYNC_OPTIONS_TYPE: ROCKETS_AUTH_USER_METADATA_MODULE_ASYNC_OPTIONS_TYPE,
} = new ConfigurableModuleBuilder<UserMetadataConfigInterface>({
  moduleName: 'RocketsAuthUserMetadata',
  optionsInjectionToken: RAW_USER_METADATA_OPTIONS_TOKEN,
})
  .setExtras<Partial<UserMetadataExtrasInterface>>(
    { global: false },
    definitionTransform,
  )
  .build();

export type RocketsAuthUserMetadataOptions =
  typeof ROCKETS_AUTH_USER_METADATA_MODULE_OPTIONS_TYPE;
export type RocketsAuthUserMetadataAsyncOptions =
  typeof ROCKETS_AUTH_USER_METADATA_MODULE_ASYNC_OPTIONS_TYPE;

/**
 * Transform the definition to include the combined providers and imports
 * Following the pattern from rockets-auth.module-definition.ts
 */
function definitionTransform(
  definition: DynamicModule,
  extras: Partial<UserMetadataExtrasInterface>,
): DynamicModule {
  const { imports = [], providers = [], exports = [] } = definition;

  return {
    ...definition,
    global: extras.global,
    imports: createRocketsAuthUserMetadataImports({
      imports,
      extras,
    }),
    providers: createRocketsAuthUserMetadataProviders({
      providers,
      extras,
    }),
    exports: createRocketsAuthUserMetadataExports({
      exports,
      extras,
    }),
  };
}

/**
 * Create imports following the rockets-auth pattern
 */
function createRocketsAuthUserMetadataImports(options: {
  imports: DynamicModule['imports'];
  extras?: Partial<UserMetadataExtrasInterface>;
}): DynamicModule['imports'] {
  const { extras } = options;

  return [
    ...(options.imports || []),

    // Additional imports from config
    ...(extras?.imports || []),
  ];
}

/**
 * Create providers following the rockets-auth pattern
 */
function createRocketsAuthUserMetadataProviders(options: {
  providers: DynamicModule['providers'];
  extras?: Partial<UserMetadataExtrasInterface>;
}): Provider[] {
  const { extras } = options;

  return [
    ...(options.providers || []),

    // Adapter provider from config (with proper DI)
    ...(extras?.adapter
      ? [
          {
            provide: ROCKETS_USER_METADATA_ADAPTER,
            useClass: extras.adapter,
          },
          // Repository provider - alias the adapter to the entity key
          {
            provide: USER_METADATA_MODULE_ENTITY_KEY,
            useExisting: ROCKETS_USER_METADATA_ADAPTER,
          },
        ]
      : []),

    // CRUD service provider
    {
      provide: UserMetadataCrudService,
      useFactory: (
        adapter: CrudAdapter<RocketsAuthUserMetadataEntityInterface>,
      ) => {
        return new UserMetadataCrudService(adapter);
      },
      inject: [ROCKETS_USER_METADATA_ADAPTER],
    },

    // UserMetadataModelService - uses factory with repository and config
    {
      provide: UserMetadataModelService,
      inject: [
        getDynamicRepositoryToken(USER_METADATA_MODULE_ENTITY_KEY),
        RAW_USER_METADATA_OPTIONS_TOKEN,
      ],
      useFactory: (
        repo: RepositoryInterface<RocketsAuthUserMetadataEntityInterface>,
        moduleConfig: UserMetadataConfigInterface,
      ) => {
        // Use custom service if provided in config
        if (moduleConfig.userMetadataModelService) {
          return new moduleConfig.userMetadataModelService(
            repo,
            moduleConfig.createDto,
            moduleConfig.updateDto,
          );
        }

        // Otherwise, use the default service
        return new GenericUserMetadataModelService(
          repo,
          moduleConfig.createDto,
          moduleConfig.updateDto,
        );
      },
    },
  ];
}

/**
 * Create exports following the rockets-auth pattern
 */
function createRocketsAuthUserMetadataExports(options: {
  exports: DynamicModule['exports'];
  extras?: Partial<UserMetadataExtrasInterface>;
}): DynamicModule['exports'] {
  return [
    ...(options.exports || []),
    RAW_USER_METADATA_OPTIONS_TOKEN,
    UserMetadataCrudService,
    UserMetadataModelService,
    ROCKETS_USER_METADATA_ADAPTER,
  ];
}
