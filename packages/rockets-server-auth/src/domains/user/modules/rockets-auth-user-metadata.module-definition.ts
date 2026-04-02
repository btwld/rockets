import {
  ConfigurableModuleBuilder,
  DynamicModule,
  Provider,
} from '@nestjs/common';
import {
  getDynamicRepositoryToken,
  RepositoryInterface,
} from '@concepta/nestjs-repository';
import { UserMetadataConfigInterface } from '../../../shared/interfaces/rockets-auth-options-extras.interface';
import { RocketsAuthUserMetadataEntityInterface } from '../interfaces/rockets-auth-user-metadata-entity.interface';
import { GenericUserMetadataModelService } from '../infrastructure/services/rockets-auth-user-metadata.model.service';
import {
  USER_METADATA_MODULE_ENTITY_KEY,
  UserMetadataModelService,
} from '../infrastructure/config/user-metadata.constants';

export const RAW_USER_METADATA_OPTIONS_TOKEN = Symbol(
  '__ROCKETS_USER_METADATA_MODULE_RAW_OPTIONS_TOKEN__',
);

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
  return [
    ...(options.providers || []),

    // TODO: Remove this token + GenericUserMetadataModelService once all callers use SaveUserMetadataCommand /
    // UserMetadataRepository (keep userMetadataModelService override story via custom repository if still needed).
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
    UserMetadataModelService,
  ];
}
