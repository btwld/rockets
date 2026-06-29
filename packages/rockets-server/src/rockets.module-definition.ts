import { createSettingsProvider } from '@concepta/nestjs-core';
import {
  ConfigurableModuleBuilder,
  DynamicModule,
  Provider,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import type { AuthBootstrap } from '@bitwild/rockets-core';
import {
  RocketsCoreModule,
  AuthServerGuard,
  ROCKETS_CORE_SETTINGS_TOKEN,
} from '@bitwild/rockets-core';
import { MeController } from './gateways/http/me.controller';
import { RocketsOptionsInterface } from './infrastructure/config/interfaces/rockets-options.interface';
import type { RocketsOptionsExtrasInterface } from './infrastructure/config/interfaces/rockets-options-extras.interface';
import type { RocketsAuthOption } from './infrastructure/config/interfaces/rockets-options-extras.interface';
import { RocketsSettingsInterface } from './infrastructure/config/interfaces/rockets-settings.interface';
import { rocketsOptionsDefaultConfig } from './infrastructure/config/rockets-options-default.config';
import {
  RAW_OPTIONS_TOKEN,
  ROCKETS_USER_METADATA_DTO_TOKEN,
} from './rockets.tokens';

function isAuthBootstrapChain(
  value: RocketsAuthOption,
): value is ReadonlyArray<AuthBootstrap> {
  return Array.isArray(value);
}

export function normalizeAuthBootstraps(
  auth: RocketsAuthOption | undefined,
): ReadonlyArray<AuthBootstrap> {
  if (auth === undefined) {
    return [];
  }
  if (isAuthBootstrapChain(auth)) {
    return [...auth];
  }
  return [auth];
}

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

function definitionTransform(
  definition: DynamicModule,
  extras: RocketsOptionsExtrasInterface,
): DynamicModule {
  const {
    imports = [],
    controllers,
    providers = [],
    exports = [],
  } = definition;

  return {
    ...definition,
    global: extras.global,
    imports: createRocketsImports({
      imports,
      extras,
    }),
    controllers: createRocketsControllers({
      controllers: extras.controllers ?? controllers,
      extras,
    }),
    providers: createRocketsProviders({ providers, extras }),
    exports: createRocketsExports({ exports }),
  };
}

export function createRocketsImports(options: {
  imports: NonNullable<DynamicModule['imports']>;
  extras?: RocketsOptionsExtrasInterface;
}): NonNullable<DynamicModule['imports']> {
  return [
    ...options.imports,
    RocketsCoreModule.forRootAsync({
      inject: [RAW_OPTIONS_TOKEN],
      useFactory: (opts: RocketsOptionsInterface) => ({
        swagger: opts.swagger,
      }),
      auth: normalizeAuthBootstraps(options.extras?.auth),
      userMetadata: options.extras?.userMetadata,
      repository: options.extras?.repository,
      resources: options.extras?.resources ?? [],
      handlers: options.extras?.handlers,
      global: true,
    }),
  ];
}

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

export function createRocketsSettingsProvider(
  optionsOverrides?: RocketsOptionsInterface,
): Provider {
  return createSettingsProvider<
    RocketsSettingsInterface,
    RocketsOptionsInterface
  >({
    settingsToken: ROCKETS_CORE_SETTINGS_TOKEN,
    optionsToken: RAW_OPTIONS_TOKEN,
    settingsKey: rocketsOptionsDefaultConfig.KEY,
    optionsOverrides,
  });
}

export function createRocketsExports(options: {
  exports: DynamicModule['exports'];
}): DynamicModule['exports'] {
  return [
    ...(options.exports ?? []),
    RAW_OPTIONS_TOKEN,
    ROCKETS_CORE_SETTINGS_TOKEN,
  ];
}

export function createRocketsProviders(options: {
  providers?: Provider[];
  extras?: RocketsOptionsExtrasInterface;
}): Provider[] {
  const extrasUserMetadata = options.extras?.userMetadata;
  const providers: Provider[] = [
    ...(options.providers ?? []),
    createRocketsSettingsProvider(),
    {
      provide: ROCKETS_USER_METADATA_DTO_TOKEN,
      useFactory: () => {
        if (extrasUserMetadata) {
          return {
            updateDto: extrasUserMetadata.updateDto,
          };
        }
        throw new Error(
          'RocketsModule: user-metadata config is required. Set ' +
            '`extras.userMetadata` to a `RocketsUserMetadataConfig` with `entity`, ' +
            '`createDto`, and `updateDto`.',
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
