import { createSettingsProvider } from '@bitwild/rockets-common';
import {
  ConfigurableModuleBuilder,
  DynamicModule,
  Provider,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import {
  RocketsCoreModule,
  AuthServerGuard,
  ROCKETS_CORE_SETTINGS_TOKEN,
  isAuthFeatureBundle,
  isRocketsAuthIntegration,
} from '@bitwild/rockets-core';
import type {
  AuthAdapterInterface,
  AuthFeatureBundle,
  ResourceInput,
  RocketsAuthIntegration,
} from '@bitwild/rockets-core';
import type { Type } from '@nestjs/common';
import { MeController } from './gateways/http/me.controller';
import { RocketsOptionsInterface } from './infrastructure/config/interfaces/rockets-options.interface';
import { RocketsOptionsExtrasInterface } from './infrastructure/config/interfaces/rockets-options-extras.interface';
import { RocketsSettingsInterface } from './infrastructure/config/interfaces/rockets-settings.interface';
import { rocketsOptionsDefaultConfig } from './infrastructure/config/rockets-options-default.config';
import {
  RAW_OPTIONS_TOKEN,
  ROCKETS_USER_METADATA_DTO_TOKEN,
} from './rockets.tokens';

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

  const mergedExtras = mergeRocketsAuthIntegrationExtras(extras);

  return {
    ...definition,
    global: extras.global,
    imports: createRocketsImports({ imports, extras: mergedExtras }),
    controllers: createRocketsControllers({
      controllers: extras.controllers ?? controllers,
      extras,
    }),
    providers: createRocketsProviders({ providers, extras: mergedExtras }),
    exports: createRocketsExports({ exports }),
  };
}

function mergeRocketsAuthIntegrationExtras(
  extras: RocketsOptionsExtrasInterface,
): RocketsOptionsExtrasInterface {
  const auth = extras.auth;
  if (!isRocketsAuthIntegration(auth)) {
    return extras;
  }
  const userMetadata = extras.userMetadata ?? auth.userMetadata;
  const enableGlobalGuard =
    auth.rocketsDefaults?.enableGlobalGuard !== undefined
      ? auth.rocketsDefaults.enableGlobalGuard
      : extras.enableGlobalGuard;

  return {
    ...extras,
    ...(userMetadata !== undefined ? { userMetadata } : {}),
    ...(enableGlobalGuard !== undefined ? { enableGlobalGuard } : {}),
  };
}

export function createRocketsImports(options: {
  imports: NonNullable<DynamicModule['imports']>;
  extras?: RocketsOptionsExtrasInterface;
}): NonNullable<DynamicModule['imports']> {
  const { auth, extraResources, authNestImports, authExternallyProvided } =
    resolveAuthExtras(options.extras?.auth);

  return [
    ...options.imports,
    RocketsCoreModule.forRootAsync({
      inject: [RAW_OPTIONS_TOKEN],
      useFactory: (opts: RocketsOptionsInterface) => ({
        swagger: opts.swagger,
      }),
      auth,
      authExternallyProvided,
      userMetadata: options.extras?.userMetadata,
      repository: options.extras?.repository,
      resources: [...extraResources, ...(options.extras?.resources ?? [])],
      handlers: options.extras?.handlers,
      global: true,
    }),
    ...authNestImports,
  ];
}

function resolveAuthExtras(
  auth:
    | Type<AuthAdapterInterface>
    | AuthFeatureBundle
    | RocketsAuthIntegration
    | undefined,
): {
  auth: Type<AuthAdapterInterface> | undefined;
  extraResources: ReadonlyArray<ResourceInput>;
  authNestImports: ReadonlyArray<DynamicModule>;
  authExternallyProvided: boolean;
} {
  if (isRocketsAuthIntegration(auth)) {
    return {
      auth: auth.authAdapter,
      extraResources: auth.resources,
      authNestImports: [...auth.nestImports],
      // Honor the integration's explicit opt-in. Default (false /
      // omitted) preserves the historic auto-push so
      // `defineRocketsAuth` and other existing consumers keep
      // working unchanged. Adapters whose deps live in a private
      // module scope (e.g. Firebase) must set this to `true` — see
      // the field's JSDoc.
      authExternallyProvided: auth.authProviderExternallyManaged === true,
    };
  }
  if (isAuthFeatureBundle(auth)) {
    return {
      auth: auth.provider,
      extraResources: [auth.resource],
      authNestImports: [],
      // The bundle's `resource` already exports the adapter, but the
      // historic behavior auto-pushed it again in core. Keep that
      // for back-compat — bundle adapters typically only inject
      // globally-available providers, so the duplicate is benign.
      authExternallyProvided: false,
    };
  }
  return {
    auth,
    extraResources: [],
    authNestImports: [],
    // Bare `Type<AuthAdapterInterface>` — core auto-provides it (the
    // historic behavior consumers rely on).
    authExternallyProvided: false,
  };
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
