import {
  createSettingsProvider,
  HookModule,
  SwaggerUiModule,
} from '@bitwild/rockets-common';
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
import { CrudModule, CrudContextOverlay } from '@bitwild/rockets-crud';
import type { RocketsResourceConfig } from './domain/interfaces/rockets-resource.interface';
import { SafeCrudContextInterceptor } from './infrastructure/interceptors/safe-crud-context.interceptor';
import { flattenRepositories } from './infrastructure/utils/flatten-repositories';
import {
  aggregateResources,
  type AggregatedResources,
} from './infrastructure/resource/aggregate-resources';
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

/**
 * Assembles the final `DynamicModule` for `RocketsCoreModule.forRoot(Async)`.
 * Invoked by the `ConfigurableModuleBuilder` after Nest has resolved the
 * async factory and produced the base `definition` (which carries
 * `defImports` for `RAW_OPTIONS_TOKEN` wiring — must be preserved).
 *
 * Pipeline:
 * 1. `aggregateResources()` flattens bundles + raw configs into
 *    `{ resources, repositoryPersistence }`.
 * 2. `createCoreImports()` appends CQRS, Config, Hook, Repository (root +
 *    forFeature per adapter), CrudModule (root + forFeature per resource),
 *    and SwaggerUI.
 * 3. `createCoreProviders()` adds the settings provider, auth provider
 *    factory, `AuthServerGuard`, `AuthorizedUserOverlay` interceptor,
 *    default CQRS handlers, plus every handler/provider auto-extracted
 *    from resources.
 * 4. `createCoreExports()` re-exports tokens + resource providers so
 *    consuming modules (server, auth) can inject them.
 *
 * @example
 * Input — extras from the consumer:
 * ```ts
 * {
 *   authProvider: new RocketsJwtAuthProvider(...),
 *   repositories: {
 *     module: TypeOrmRepositoryModule,
 *     userMetadata: { entity: UserMetadataEntity },
 *     entities: [{ key: 'audit', entity: AuditLogEntity }],
 *   },
 *   resources: [petBundle, vaccinationBundle, rawReportConfig],
 *   swagger: { documentBuilder: ..., settings: ... },
 * }
 * ```
 *
 * Output — a fully-wired `DynamicModule`:
 * ```ts
 * {
 *   module: RocketsCoreModule,
 *   global: true,
 *   imports: [
 *     ...defImports,                 // RAW_OPTIONS_TOKEN wiring — do not lose
 *     CqrsModule.forRoot(),
 *     ConfigModule.forFeature(rocketsCoreDefaultConfig),
 *     HookModule.forRoot({}),        // BEFORE RepositoryModule
 *     RepositoryModule.forRoot({}),
 *     RepositoryModule.forFeature({  // from extras.repositories
 *       module: TypeOrmRepositoryModule,
 *       entities: [
 *         { key: 'userMetadata', entity: UserMetadataEntity },
 *         { key: 'audit',        entity: AuditLogEntity },
 *       ],
 *     }),
 *     RepositoryModule.forFeature({  // from aggregated bundles
 *       module: TypeOrmRepositoryModule,
 *       entities: [
 *         { key: 'pet',             entity: PetEntity },
 *         { key: 'petVaccination',  entity: PetVaccinationEntity },
 *       ],
 *     }),
 *     CrudModule.forRoot({}),
 *     CrudModule.forFeature(petBundle.core),
 *     CrudModule.forFeature(vaccinationBundle.core),
 *     CrudModule.forFeature(rawReportConfig),
 *     SwaggerUiModule.registerAsync({...}),
 *   ],
 *   controllers: [], // core NEVER declares controllers
 *   providers: [
 *     settingsProvider, Reflector,
 *     { provide: AUTH_PROVIDER_TOKEN, useFactory: opts => opts.authProvider },
 *     AuthServerGuard,
 *     { provide: APP_INTERCEPTOR, useClass: AuthorizedUserOverlay },
 *     UpsertUserMetadataHandler, GetUserMetadataHandler,
 *     PetCreateHandler, OwnerScopeHook, ... // auto-extracted from resources
 *   ],
 *   exports: [
 *     ConfigModule, RAW_OPTIONS_TOKEN, AUTH_PROVIDER_TOKEN,
 *     ROCKETS_CORE_SETTINGS_TOKEN, AuthServerGuard,
 *     PetCreateHandler, OwnerScopeHook, ... // resource providers re-exported
 *   ],
 * }
 * ```
 */
function definitionTransform(
  definition: DynamicModule,
  extras: RocketsCoreOptionsExtrasInterface,
): DynamicModule {
  const {
    imports: defImports = [],
    providers = [],
    exports: defExports = [],
  } = definition;

  // Aggregate resource inputs once — used by imports, providers, and exports
  const aggregated = aggregateResources({
    resources: extras.resources ?? [],
  });

  return {
    ...definition,
    global: extras.global ?? true,
    imports: [...defImports, ...createCoreImports(extras, aggregated)],
    controllers: [], // ⛔ NO controllers — ever
    providers: createCoreProviders({ providers, extras, aggregated }),
    exports: createCoreExports({ exports: defExports, aggregated }),
  };
}

function createCoreImports(
  extras: RocketsCoreOptionsExtrasInterface,
  aggregated: AggregatedResources,
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

  // Flatten the unified repositories config into RepositoryModule.forFeature() calls
  if (extras.repositories) {
    const persistence = flattenRepositories(extras.repositories);
    for (const entry of persistence) {
      imports.push(RepositoryModule.forFeature(entry));
    }
  }

  // Register resource-derived entity repos (from defineResource bundles)
  for (const entry of aggregated.repositoryPersistence) {
    imports.push(RepositoryModule.forFeature(entry));
  }

  // Register CRUD resources.
  //
  // `CrudModule.forRoot({})` registers the upstream `CrudContextOverlay`
  // as a global `APP_INTERCEPTOR` whose `resolve()` throws
  // `CrudContextException` on any handler without `@CrudOperation` —
  // breaking every hand-written controller in a mixed-controller app
  // (auth, /me, bespoke endpoints). We import the upstream module for
  // its infrastructure (CrudMetaview, CrudAdapterResolver, settings,
  // etc.) but strip the unsafe APP_INTERCEPTOR and substitute
  // `SafeCrudContextInterceptor`, which no-ops on non-CRUD handlers.
  if (aggregated.resources.length) {
    imports.push(createSafeCrudRootModule());
    for (const resource of aggregated.resources) {
      imports.push(CrudModule.forFeature(resource));
    }
  }

  // Swagger UI — registered from core so both server and auth get it
  imports.push(
    SwaggerUiModule.registerAsync({
      inject: [RAW_OPTIONS_TOKEN],
      useFactory: (opts: RocketsCoreOptionsInterface) => ({
        documentBuilder: opts.swagger?.documentBuilder,
        settings: opts.swagger?.settings,
      }),
    }),
  );

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
  aggregated: AggregatedResources;
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
    ...extractResourceProviders(options.aggregated.resources),
  ];
}

function createCoreExports(options: {
  exports: DynamicModule['exports'];
  aggregated: AggregatedResources;
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
  for (const resource of options.aggregated.resources) {
    exports.push(...(resource.providers ?? []));
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

  const seen = new Set<Type>();

  for (const resource of resources) {
    // Handlers from operations (operations exists on hybrid/generated crud configs)
    if ('operations' in resource.crud) {
      for (const op of resource.crud.operations) {
        if (
          'queryHandler' in op &&
          op.queryHandler &&
          !seen.has(op.queryHandler)
        ) {
          seen.add(op.queryHandler);
          providers.push(op.queryHandler);
        }
        if (
          'commandHandler' in op &&
          op.commandHandler &&
          !seen.has(op.commandHandler)
        ) {
          seen.add(op.commandHandler);
          providers.push(op.commandHandler);
        }
      }
    }

    // Declared providers
    providers.push(...(resource.providers ?? []));
  }

  return providers;
}

/**
 * Builds a `DynamicModule` equivalent to `CrudModule.forRoot({})` but with
 * the unsafe global APP_INTERCEPTOR swapped for `SafeCrudContextInterceptor`.
 *
 * Every non-APP_INTERCEPTOR provider from upstream is preserved verbatim —
 * including `CrudMetaview`, `CrudAdapterResolver`, `CrudOperationResolver`,
 * the `CRUD_DEFAULT_RESOLVER_TOKEN`, the `CRUD_MODULE_SETTINGS_TOKEN`
 * settings provider, and `CrudContextOverlay` itself (which the safe
 * interceptor injects to delegate attachment on real CRUD routes).
 *
 * See `SafeCrudContextInterceptor` for the rationale behind the swap.
 */
// TODO(upstream: concepta/nestjs-crud) — this function reaches into the
// DynamicModule returned by CrudModule.forRoot({}), filters its provider
// list by identity, and rebuilds it. It exists ONLY because upstream
// registers CrudContextOverlay as a global APP_INTERCEPTOR whose resolve()
// throws on non-CRUD handlers. When upstream makes that interceptor no-op
// on handlers without @CrudOperation metadata, delete this function and
// its call site above — swap to the bare CrudModule.forRoot({}) import.
function createSafeCrudRootModule(): DynamicModule {
  const crudRoot = CrudModule.forRoot({}) as DynamicModule;

  const originalProviders: NonNullable<DynamicModule['providers']> =
    crudRoot.providers ?? [];
  const filteredProviders = originalProviders.filter((p) => {
    if (typeof p === 'object' && p !== null && 'provide' in p) {
      if (
        p.provide === APP_INTERCEPTOR &&
        'useClass' in p &&
        p.useClass === CrudContextOverlay
      ) {
        return false;
      }
    }
    return true;
  });

  const originalExports: NonNullable<DynamicModule['exports']> =
    crudRoot.exports ?? [];

  return {
    ...crudRoot,
    providers: [
      ...filteredProviders,
      SafeCrudContextInterceptor,
      { provide: APP_INTERCEPTOR, useClass: SafeCrudContextInterceptor },
    ],
    exports: [...originalExports, SafeCrudContextInterceptor],
  };
}
