import { createSettingsProvider, HookModule } from '@bitwild/rockets-common';
import {
  ConfigurableModuleBuilder,
  DynamicModule,
  Provider,
  Type,
} from '@nestjs/common';
import { APP_INTERCEPTOR, Reflector } from '@nestjs/core';
import { CqrsModule } from '@nestjs/cqrs';
import { ConfigModule } from '@nestjs/config';
import { RepositoryModule } from '@bitwild/rockets-repository';
import { CrudModule } from '@bitwild/rockets-crud';
import type { RocketsResourceConfig } from './domain/interfaces/rockets-resource.interface';
import {
  AUTH_PROVIDER_TOKEN,
  ROCKETS_CORE_SETTINGS_TOKEN,
} from './rockets-core.constants';
import { RAW_OPTIONS_TOKEN } from './rockets-core.tokens';
import { AuthProviderInterface } from './domain/interfaces/auth-provider.interface';
import { RocketsCoreOptionsInterface } from './infrastructure/config/interfaces/rockets-core-options.interface';
import { RocketsCoreOptionsExtrasInterface } from './infrastructure/config/interfaces/rockets-core-options-extras.interface';
import { RocketsCoreSettingsInterface } from './infrastructure/config/interfaces/rockets-core-settings.interface';
import { rocketsCoreDefaultConfig } from './infrastructure/config/rockets-core-options-default.config';
import { AuthServerGuard } from './infrastructure/guards/auth-server.guard';
import { AuthorizedUserOverlay } from './infrastructure/interceptors/authorized-user.overlay';
import { UpsertUserMetadataHandler } from './application/commands/handlers/upsert-user-metadata.handler';
import { GetUserMetadataHandler } from './application/queries/handlers/get-user-metadata.handler';

export const {
  ConfigurableModuleClass: RocketsCoreModuleClass,
  OPTIONS_TYPE: ROCKETS_CORE_OPTIONS_TYPE,
  ASYNC_OPTIONS_TYPE: ROCKETS_CORE_ASYNC_OPTIONS_TYPE,
} = new ConfigurableModuleBuilder<RocketsCoreOptionsInterface>({
  moduleName: 'RocketsCore',
  optionsInjectionToken: RAW_OPTIONS_TOKEN,
})
  .setExtras<RocketsCoreOptionsExtrasInterface>(
    { global: true },
    definitionTransform,
  )
  .build();

export type RocketsCoreOptions = typeof ROCKETS_CORE_OPTIONS_TYPE;
export type RocketsCoreAsyncOptions = typeof ROCKETS_CORE_ASYNC_OPTIONS_TYPE;

function definitionTransform(
  definition: DynamicModule,
  extras: RocketsCoreOptionsExtrasInterface,
): DynamicModule {
  const {
    imports: defImports = [],
    providers = [],
    exports: defExports = [],
  } = definition;

  return {
    ...definition,
    global: extras.global ?? true,
    imports: [...defImports, ...createCoreImports(extras)],
    controllers: [], // ⛔ NO controllers — ever
    providers: createCoreProviders({ providers, extras }),
    exports: createCoreExports({ exports: defExports, extras }),
  };
}

function createCoreImports(
  extras: RocketsCoreOptionsExtrasInterface,
): NonNullable<DynamicModule['imports']> {
  const imports: NonNullable<DynamicModule['imports']> = [
    CqrsModule.forRoot(),
    ConfigModule.forFeature(rocketsCoreDefaultConfig),
    // HookModule must be registered BEFORE RepositoryModule so that
    // HookResolverService is available when TypeORM repository factories
    // optionally inject it. Without this, @RepoHook hooks silently no-op
    // because the adapter's hookResolver is undefined.
    HookModule.forRoot({}),
    RepositoryModule.forRoot({}),
  ];

  if (extras.repositoryPersistence?.length) {
    for (const persistence of extras.repositoryPersistence) {
      imports.push(RepositoryModule.forFeature(persistence));
    }
  }

  if (extras.resources?.length) {
    imports.push(CrudModule.forRoot({}));
    for (const resource of extras.resources) {
      imports.push(CrudModule.forFeature(resource));
    }
  }

  return imports;
}

function createCoreSettingsProvider(): Provider {
  return createSettingsProvider<
    RocketsCoreSettingsInterface,
    RocketsCoreOptionsInterface
  >({
    settingsToken: ROCKETS_CORE_SETTINGS_TOKEN,
    optionsToken: RAW_OPTIONS_TOKEN,
    settingsKey: rocketsCoreDefaultConfig.KEY,
  });
}

function createCoreProviders(options: {
  providers?: Provider[];
  extras?: RocketsCoreOptionsExtrasInterface;
}): Provider[] {
  return [
    ...(options.providers ?? []),
    createCoreSettingsProvider(),
    Reflector,
    {
      provide: AUTH_PROVIDER_TOKEN,
      inject: [RAW_OPTIONS_TOKEN],
      useFactory: (opts: RocketsCoreOptionsInterface): AuthProviderInterface =>
        opts.authProvider,
    },
    AuthServerGuard,
    { provide: APP_INTERCEPTOR, useClass: AuthorizedUserOverlay },
    // Default CQRS handlers — can be overridden by the caller via extras.handlers
    options.extras?.handlers?.upsertUserMetadata ?? UpsertUserMetadataHandler,
    options.extras?.handlers?.getUserMetadata ?? GetUserMetadataHandler,
    ...(options.extras?.providers ?? []),
    ...extractResourceProviders(options.extras?.resources),
  ];
}

function createCoreExports(options: {
  exports: DynamicModule['exports'];
  extras?: RocketsCoreOptionsExtrasInterface;
}): DynamicModule['exports'] {
  const exports: NonNullable<DynamicModule['exports']> = [
    ...(options.exports ?? []),
    ConfigModule,
    RAW_OPTIONS_TOKEN,
    AUTH_PROVIDER_TOKEN,
    ROCKETS_CORE_SETTINGS_TOKEN,
    AuthServerGuard,
  ];

  // Resource providers exported → available app-wide
  if (options.extras?.resources?.length) {
    for (const resource of options.extras.resources) {
      exports.push(...(resource.providers ?? []));
    }
  }

  return exports;
}

/**
 * Auto-extract handlers declared in CRUD operations + resource-level providers.
 * The consumer doesn't need to repeat handlers in a separate providers array.
 */
function extractResourceProviders(
  resources?: ReadonlyArray<RocketsResourceConfig>,
): Provider[] {
  if (!resources?.length) return [];

  const providers: Provider[] = [];

  // TODO: need to validade if it wont be registered duplicated
  for (const resource of resources) {
    // Handlers from operations (operations exists on hybrid/generated crud configs)
    if ('operations' in resource.crud) {
      for (const op of resource.crud.operations) {
        if ('queryHandler' in op && op.queryHandler) {
          providers.push(op.queryHandler as Type);
        }
        if ('commandHandler' in op && op.commandHandler) {
          providers.push(op.commandHandler as Type);
        }
      }
    }

    // Declared providers
    providers.push(...(resource.providers ?? []));
  }

  return providers;
}
