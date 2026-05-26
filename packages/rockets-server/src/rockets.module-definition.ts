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
  ResourceInput,
} from '@bitwild/rockets-core';
import type { Type } from '@nestjs/common';
import { MeController } from './gateways/http/me.controller';
import { RocketsOptionsInterface } from './infrastructure/config/interfaces/rockets-options.interface';
import {
  RocketsOptionsExtrasInterface,
  type RocketsAuthInput,
} from './infrastructure/config/interfaces/rockets-options-extras.interface';
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
  // Find the first integration in the chain that contributes
  // userMetadata / rocketsDefaults. Single-entry `auth` and array
  // `auth` are normalised the same way; non-integration entries
  // (bare `Type`, `AuthFeatureBundle`) are skipped.
  const integrations = toAuthEntries(extras.auth).filter(
    isRocketsAuthIntegration,
  );
  if (integrations.length === 0) {
    return extras;
  }

  const sourceForUserMetadata = integrations.find(
    (i) => i.userMetadata !== undefined,
  );
  const sourceForGuardDefault = integrations.find(
    (i) => i.rocketsDefaults?.enableGlobalGuard !== undefined,
  );

  const userMetadata =
    extras.userMetadata ?? sourceForUserMetadata?.userMetadata;
  const enableGlobalGuard =
    sourceForGuardDefault?.rocketsDefaults?.enableGlobalGuard !== undefined
      ? sourceForGuardDefault.rocketsDefaults.enableGlobalGuard
      : extras.enableGlobalGuard;

  return {
    ...extras,
    ...(userMetadata !== undefined ? { userMetadata } : {}),
    ...(enableGlobalGuard !== undefined ? { enableGlobalGuard } : {}),
  };
}

/**
 * Normalise `extras.auth` (single entry or array) into a flat list.
 * Returns an empty array when `auth` is undefined.
 */
function toAuthEntries(
  auth: RocketsOptionsExtrasInterface['auth'],
): ReadonlyArray<RocketsAuthInput> {
  if (auth === undefined) return [];
  // `Array.isArray` widens `ReadonlyArray<T>` to `any[]`, so we narrow
  // through a typed local instead of relying on the predicate.
  if (isAuthInputArray(auth)) return auth;
  return [auth];
}

function isAuthInputArray(
  value: RocketsAuthInput | ReadonlyArray<RocketsAuthInput>,
): value is ReadonlyArray<RocketsAuthInput> {
  return Array.isArray(value);
}

export function createRocketsImports(options: {
  imports: NonNullable<DynamicModule['imports']>;
  extras?: RocketsOptionsExtrasInterface;
}): NonNullable<DynamicModule['imports']> {
  const resolved = resolveAuthChain(options.extras?.auth);

  return [
    ...options.imports,
    RocketsCoreModule.forRootAsync({
      inject: [RAW_OPTIONS_TOKEN],
      useFactory: (opts: RocketsOptionsInterface) => ({
        swagger: opts.swagger,
      }),
      auth: resolved.adapters,
      authExternallyProvided: resolved.authExternallyProvided,
      userMetadata: options.extras?.userMetadata,
      repository: options.extras?.repository,
      resources: [
        ...resolved.extraResources,
        ...(options.extras?.resources ?? []),
      ],
      handlers: options.extras?.handlers,
      global: true,
    }),
    ...resolved.authNestImports,
  ];
}

interface ResolvedAuthChain {
  readonly adapters: ReadonlyArray<Type<AuthAdapterInterface>>;
  readonly extraResources: ReadonlyArray<ResourceInput>;
  readonly authNestImports: ReadonlyArray<DynamicModule>;
  readonly authExternallyProvided: ReadonlyArray<boolean>;
}

/**
 * Expand `extras.auth` (single or array) into the resolved chain
 * passed down to `RocketsCoreModule`. Per-entry rules:
 *
 *  - `RocketsAuthIntegration` — adapter + resources + nestImports
 *    contributed; adapter is always treated as externally provided
 *    (it lives in `nestImports`, so core must not duplicate it).
 *  - `AuthFeatureBundle` — adapter + the bundle's resource contributed;
 *    auto-provided in core (bundles typically only depend on globals).
 *  - Bare `Type<AuthAdapterInterface>` — adapter contributed; core
 *    auto-pushes it as a provider.
 *
 * Order is preserved end-to-end — first chain entry wins in the guard.
 *
 * Exported for unit testing.
 */
export function resolveAuthChain(
  auth: RocketsOptionsExtrasInterface['auth'],
): ResolvedAuthChain {
  const entries = toAuthEntries(auth);
  if (entries.length === 0) {
    return {
      adapters: [],
      extraResources: [],
      authNestImports: [],
      authExternallyProvided: [],
    };
  }

  const adapters: Array<Type<AuthAdapterInterface>> = [];
  const extraResources: ResourceInput[] = [];
  const authNestImports: DynamicModule[] = [];
  const authExternallyProvided: boolean[] = [];

  for (const entry of entries) {
    if (isRocketsAuthIntegration(entry)) {
      adapters.push(entry.authAdapter);
      extraResources.push(...entry.resources);
      authNestImports.push(...entry.nestImports);
      // Adapter lives inside one of the nestImports modules when the list
      // is non-empty (real `defineRocketsAuth()` pattern). When nestImports
      // is empty the adapter is standalone and core must auto-register it.
      authExternallyProvided.push(entry.nestImports.length > 0);
      continue;
    }
    if (isAuthFeatureBundle(entry)) {
      adapters.push(entry.provider);
      extraResources.push(entry.resource);
      authExternallyProvided.push(false);
      continue;
    }
    // Bare `Type<AuthAdapterInterface>` — core auto-pushes.
    adapters.push(entry);
    authExternallyProvided.push(false);
  }

  return {
    adapters,
    extraResources,
    authNestImports,
    authExternallyProvided,
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
