import {
  createSettingsProvider,
  getDynamicRepositoryToken,
  RepositoryInterface,
} from '@concepta/nestjs-common';
import {
  ConfigurableModuleBuilder,
  DynamicModule,
  Provider,
} from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { SwaggerUiModule } from '@concepta/nestjs-swagger-ui';
import { ConfigModule } from '@nestjs/config';
import {
  RocketsAuthProvider,
  ROCKETS_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN,
} from './rockets.constants';
import { MeController } from './modules/user/me.controller';
import { AuthProviderInterface } from './interfaces/auth-provider.interface';
import { RocketsOptionsInterface } from './interfaces/rockets-options.interface';
import { RocketsOptionsExtrasInterface } from './interfaces/rockets-options-extras.interface';
import { RocketsSettingsInterface } from './interfaces/rockets-settings.interface';
import { rocketsOptionsDefaultConfig } from './config/rockets-options-default.config';
import { AuthServerGuard } from './guards/auth-server.guard';
import { GenericUserMetadataModelService } from './modules/user-metadata/services/user-metadata.model.service';
import {
  UserMetadataModelService,
  USER_METADATA_MODULE_ENTITY_KEY,
} from './modules/user-metadata/constants/user-metadata.constants';
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
 * Transform the definition to include the combined modules.
 * Follows SDK patterns for module transformation.
 */
function definitionTransform(
  definition: DynamicModule,
  extras: RocketsOptionsExtrasInterface,
): DynamicModule {
  const {
    imports: defImports = [],
    controllers: defControllers,
    providers = [],
    exports = [],
  } = definition;

  return {
    ...definition,
    global: extras.global,
    imports: createRocketsImports({ imports: defImports }),
    controllers: createRocketsControllers({
      controllers: extras.controllers ?? defControllers,
      extras,
    }),
    providers: createRocketsProviders({ providers, extras }),
    exports: createRocketsExports({ exports }),
  };
}

/**
 * Create controllers for the combined module.
 * When explicit controllers are provided, use them directly.
 * Otherwise, build the default list based on disable flags.
 */
export function createRocketsControllers(options: {
  controllers?: DynamicModule['controllers'];
  extras?: RocketsOptionsExtrasInterface;
}): DynamicModule['controllers'] {
  if (options.controllers !== undefined) {
    return options.controllers;
  }

  const disableController = options.extras?.disableController ?? {};
  const controllers: DynamicModule['controllers'] = [];

  if (!disableController.me) {
    controllers.push(MeController);
  }

  return controllers;
}

/**
 * Create settings provider.
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
 * Create imports for the combined module.
 */
export function createRocketsImports(options: {
  imports?: DynamicModule['imports'];
}): NonNullable<DynamicModule['imports']> {
  const baseImports: NonNullable<DynamicModule['imports']> = [
    ConfigModule.forFeature(rocketsOptionsDefaultConfig),
    SwaggerUiModule.registerAsync({
      inject: [RAW_OPTIONS_TOKEN],
      useFactory: (opts: RocketsOptionsInterface) => ({
        documentBuilder: opts.swagger?.documentBuilder,
        settings: opts.swagger?.settings,
      }),
    }),
  ];

  return [...(options.imports ?? []), ...baseImports];
}

/**
 * Create exports for the combined module.
 */
export function createRocketsExports(options: {
  exports: DynamicModule['exports'];
}): DynamicModule['exports'] {
  return [
    ...(options.exports ?? []),
    ConfigModule,
    RAW_OPTIONS_TOKEN,
    ROCKETS_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN,
    UserMetadataModelService,
  ];
}

/**
 * Create providers for the combined module.
 */
export function createRocketsProviders(options: {
  providers?: Provider[];
  extras?: RocketsOptionsExtrasInterface;
}): Provider[] {
  const providers: Provider[] = [
    ...(options.providers ?? []),
    createRocketsSettingsProvider(),
    Reflector,
    {
      provide: RocketsAuthProvider,
      inject: [RAW_OPTIONS_TOKEN],
      useFactory: (opts: RocketsOptionsInterface): AuthProviderInterface =>
        opts.authProvider,
    },
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

  if (options.extras?.enableGlobalGuard !== false) {
    providers.push({
      provide: APP_GUARD,
      useClass: AuthServerGuard,
    });
  }

  return providers;
}
