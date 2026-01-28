import { createSettingsProvider } from '@concepta/nestjs-common';
import {
  ConfigurableModuleBuilder,
  DynamicModule,
  Provider,
} from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { SwaggerUiModule } from '@concepta/nestjs-swagger-ui';
import {
  RocketsAuthProvider,
  ROCKETS_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN,
} from './rockets.constants';
import { MeController } from './modules/user/me.controller';
import { AuthProviderInterface } from './interfaces/auth-provider.interface';
import { RocketsOptionsInterface } from './interfaces/rockets-options.interface';
import { RocketsOptionsExtrasInterface } from './interfaces/rockets-options-extras.interface';
import { ConfigModule } from '@nestjs/config';
import { RocketsSettingsInterface } from './interfaces/rockets-settings.interface';
import { rocketsOptionsDefaultConfig } from './config/rockets-options-default.config';
import { AuthServerGuard } from './guards/auth-server.guard';
import { GenericUserMetadataModelService } from './modules/user-metadata/services/user-metadata.model.service';
import {
  UserMetadataModelService,
  USER_METADATA_MODULE_ENTITY_KEY,
} from './modules/user-metadata/constants/user-metadata.constants';
import {
  getDynamicRepositoryToken,
  RepositoryInterface,
} from '@concepta/nestjs-common';
import { UserMetadataEntityInterface } from './modules/user-metadata/interfaces/user-metadata.interface';

import { RAW_OPTIONS_TOKEN } from './rockets.tokens';

export const {
  ConfigurableModuleClass: RocketsModuleClass,
  OPTIONS_TYPE: ROCKETS_MODULE_OPTIONS_TYPE,
  ASYNC_OPTIONS_TYPE: ROCKETS_MODULE_ASYNC_OPTIONS_TYPE,
} = new ConfigurableModuleBuilder<RocketsOptionsInterface>({
  moduleName: 'Rockets',
  optionsInjectionToken: RAW_OPTIONS_TOKEN,
})
  .setExtras<RocketsOptionsExtrasInterface>(
    { global: false },
    definitionTransform,
  )
  .build();

export type RocketsOptions = Omit<typeof ROCKETS_MODULE_OPTIONS_TYPE, 'global'>;

export type RocketsAsyncOptions = Omit<
  typeof ROCKETS_MODULE_ASYNC_OPTIONS_TYPE,
  'global'
>;

/**
 * Transform the definition to include the combined modules
 * Follows SDK patterns for module transformation
 */
function definitionTransform(
  definition: DynamicModule,
  extras: RocketsOptionsExtrasInterface,
): DynamicModule {
  const { imports: defImports = [], providers = [], exports = [] } = definition;

  // Base module
  const baseModule: DynamicModule = {
    ...definition,
    global: extras.global,
    imports: [...createRocketsImports({ imports: defImports, extras })],
    controllers: createRocketsControllers({ extras }) || [],
    providers: [...createRocketsProviders({ providers, extras })],
    exports: createRocketsExports({ exports, extras }),
  };

  return baseModule;
}

/**
 * Create controllers for the combined module
 * Follows SDK patterns for controller creation
 */
export function createRocketsControllers(options: {
  controllers?: DynamicModule['controllers'];
  extras?: RocketsOptionsExtrasInterface;
}): DynamicModule['controllers'] {
  return options?.controllers !== undefined
    ? options.controllers
    : (() => {
        const disableController = options?.extras?.disableController || {};
        const list: DynamicModule['controllers'] = [];

        if (!disableController.me) list.push(MeController);

        return list;
      })();
}

/**
 * Create settings provider
 * Follows SDK patterns for settings providers
 */
export function createRocketsSettingsProvider(
  optionsOverrides?: RocketsOptionsInterface,
): Provider {
  return createSettingsProvider<
    RocketsSettingsInterface,
    RocketsOptionsInterface
  >({
    settingsToken: ROCKETS_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN,
    optionsToken: RAW_OPTIONS_TOKEN,
    settingsKey: rocketsOptionsDefaultConfig.KEY,
    optionsOverrides,
  });
}

/**
 * Create imports for the combined module
 * Follows SDK patterns for import creation
 */
export function createRocketsImports(options: {
  imports?: DynamicModule['imports'];
  extras?: RocketsOptionsExtrasInterface;
}): NonNullable<DynamicModule['imports']> {
  const baseImports: NonNullable<DynamicModule['imports']> = [
    ConfigModule.forFeature(rocketsOptionsDefaultConfig),
    SwaggerUiModule.registerAsync({
      inject: [RAW_OPTIONS_TOKEN],
      useFactory: (options: RocketsOptionsInterface) => {
        return {
          documentBuilder: options.swagger?.documentBuilder,
          settings: options.swagger?.settings,
        };
      },
    }),
  ];
  const extraImports = options.imports ?? [];
  return [...extraImports, ...baseImports];
}

/**
 * Create exports for the combined module
 * Follows SDK patterns for export creation
 */
export function createRocketsExports(options: {
  exports: DynamicModule['exports'];
  extras?: RocketsOptionsExtrasInterface;
}): DynamicModule['exports'] {
  return [
    ...(options.exports || []),
    ConfigModule,
    RAW_OPTIONS_TOKEN,
    ROCKETS_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN,
    UserMetadataModelService,
  ];
}

/**
 * Create providers for the combined module
 * Follows SDK patterns for provider creation
 */
export function createRocketsProviders(options: {
  providers?: Provider[];
  extras?: RocketsOptionsExtrasInterface;
}): Provider[] {
  const providers: Provider[] = [
    ...(options.providers ?? []),
    createRocketsSettingsProvider(),
    Reflector, // Add Reflector explicitly
    {
      provide: RocketsAuthProvider,
      inject: [RAW_OPTIONS_TOKEN],
      useFactory: (opts: RocketsOptionsInterface): AuthProviderInterface => {
        return opts.authProvider;
      },
    },
    // UserMetadata service provider
    {
      provide: UserMetadataModelService,
      inject: [
        RAW_OPTIONS_TOKEN,
        getDynamicRepositoryToken(USER_METADATA_MODULE_ENTITY_KEY),
      ],
      useFactory: (
        opts: RocketsOptionsInterface,
        repository: RepositoryInterface<UserMetadataEntityInterface>,
      ) => {
        const { createDto, updateDto } = opts.userMetadata;
        return new GenericUserMetadataModelService(
          repository,
          createDto,
          updateDto,
        );
      },
    },
  ];

  // Conditionally add global guard based on enableGlobalGuard in extras
  // Default: true (when enableGlobalGuard is not explicitly set to false)
  if (options.extras?.enableGlobalGuard !== false) {
    providers.push({
      provide: APP_GUARD,
      useClass: AuthServerGuard,
    });
  }

  return providers;
}
