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
import { AuthUserContextOverlay } from '@concepta/nestjs-authentication';
import type { RocketsResourceConfig } from './domain/interfaces/rockets-resource.interface';
import { SafeCrudContextInterceptor } from './infrastructure/interceptors/safe-crud-context.interceptor';
import { flattenRepositories } from './infrastructure/utils/flatten-repositories';
import {
  prepareResourceRegistration,
  type ResourceRegistrationPlan,
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
import { ActorOverlay } from './infrastructure/interceptors/actor.overlay';
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
 * Where `RocketsCoreModule.forRoot(Async)(...)` turns options into a real Nest module.
 *
 * Why this exists:
 * - Nest’s config builder already gives us a `definition` (imports/exports) that
 *   wires the async `RAW_OPTIONS_TOKEN` factory. **We must keep that first** —
 *   otherwise options injection silently breaks.
 * - On top of that, Rockets adds the “Rockets stack” (CQRS, hooks, repos, CRUD, swagger)
 *   and a little startup validation for `resources` (`prepareResourceRegistration`).
 *
 * What it does, in order:
 * 1) `prepareResourceRegistration` → figures out the CRUD configs to import and which
 *    entity repos must exist for the generated resources.
 * 2) `createCoreImports` → registers supporting modules + the CRUD + swagger wiring.
 * 3) `createCoreProviders` → auth provider, global interceptors, core CQRS handlers, etc.
 * 4) `createCoreExports` → re-exports tokens and anything resources need app-wide.
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

  // Figure out the CRUD configs to register + the repository wiring plan.
  //
  // We also pass `repositories` in so relations can point at “extra” entities
  // that don’t have their own `defineResource()` (junction tables, lookup rows, etc.).
  const resourcePlan = prepareResourceRegistration({
    resourceDefinitions: extras.resources ?? [],
    repositories: extras.repositories,
  });

  return {
    ...definition,
    global: extras.global ?? true,
    imports: [...defImports, ...createCoreImports(extras, resourcePlan)],
    controllers: [], // ⛔ NO controllers — ever
    providers: createCoreProviders({ providers, extras, resourcePlan }),
    exports: createCoreExports({ exports: defExports, resourcePlan }),
  };
}

function createCoreImports(
  extras: RocketsCoreOptionsExtrasInterface,
  resourcePlan: ResourceRegistrationPlan,
): NonNullable<DynamicModule['imports']> {
  const imports: NonNullable<DynamicModule['imports']> = [
    CqrsModule.forRoot(),
    ConfigModule.forFeature(rocketsCoreDefaultConfig),
    // Register hooks *before* repositories, otherwise repository-level hooks
    // won’t be wired and will quietly do nothing.
    HookModule.forRoot({}),
    RepositoryModule.forRoot({}),
  ];

  // `repositories` is the user’s “extra tables” list: userMetadata + more entities
  if (extras.repositories) {
    const persistence = flattenRepositories(extras.repositories);
    for (const entry of persistence) {
      imports.push(RepositoryModule.forFeature(entry));
    }
  }

  // Extra tables implied by `defineResource()` (only the generated path supplies this)
  for (const entry of resourcePlan.repositoryPersistence) {
    imports.push(RepositoryModule.forFeature(entry));
  }

  // CRUD routes. Upstream `CrudModule` ships a very strict request interceptor; we
  // replace it with a safer one so non-CRUD controllers still work in the same app.
  if (resourcePlan.resources.length) {
    imports.push(createSafeCrudRootModule());
    for (const resource of resourcePlan.resources) {
      imports.push(CrudModule.forFeature(resource));
    }
  }

  // Swagger UI is registered here so all Rockets entrypoints share the same docs
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
  resourcePlan: ResourceRegistrationPlan;
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
    // Makes the authenticated user available to the CRUD system (`@AuthUser()` in upstream v8).
    // (When you use the full auth module, that module may register the same thing — don’t double up.)
    { provide: APP_INTERCEPTOR, useClass: AuthUserContextOverlay },
    // Adds a simple “who did this?” id for repository hooks/audit (not the full user profile).
    { provide: APP_INTERCEPTOR, useClass: ActorOverlay },
    // Built-in user-metadata CQRS (override in `extras.handlers` if you need to customize storage)
    options.extras?.handlers?.upsertUserMetadata ?? UpsertUserMetadataHandler,
    options.extras?.handlers?.getUserMetadata ?? GetUserMetadataHandler,
    ...(options.extras?.providers ?? []),
    ...extractResourceProviders(options.resourcePlan.resources),
  ];
}

function createCoreExports(options: {
  exports: DynamicModule['exports'];
  resourcePlan: ResourceRegistrationPlan;
}): DynamicModule['exports'] {
  const exports: NonNullable<DynamicModule['exports']> = [
    ...(options.exports ?? []),
    ConfigModule,
    RAW_OPTIONS_TOKEN,
    AUTH_PROVIDER_TOKEN,
    ROCKETS_CORE_SETTINGS_TOKEN,
    AuthServerGuard,
  ];

  // Re-export per-resource providers (custom handlers, hooks) so the rest of the
  // app can inject them without importing every feature module twice.
  for (const resource of options.resourcePlan.resources) {
    exports.push(...(resource.providers ?? []));
  }

  return exports;
}

/**
 * Collect all Nest providers a resource needs:
 * - CQRS handler classes referenced by CRUD operations
 * - any extra `providers: [...]` attached to the resource
 */
function extractResourceProviders(
  resources?: ReadonlyArray<RocketsResourceConfig>,
): Provider[] {
  if (!resources?.length) return [];

  const providers: Provider[] = [];

  const seen = new Set<Type>();

  for (const resource of resources) {
    // Operation handlers (if present) — this is the normal `defineResource` path
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

    // Any extra classes the resource needs registered (hooks, side-effect services, …)
    providers.push(...(resource.providers ?? []));
  }

  return providers;
}

/**
 * The upstream `CrudModule` installs a “strict” request interceptor.
 *
 * That’s great for pure CRUD apps, but in Rockets you often also have other
 * controllers (auth, `/me`, one-off routes). The strict interceptor can throw on
 * those, so we swap in `SafeCrudContextInterceptor` which only activates for real
 * CRUD routes.
 */
// Workaround: upstream `CrudContextOverlay` is a global `APP_INTERCEPTOR` and can
// break non-CRUD routes. We remove the provider and replace it with a safe one.
// Remove this once the upstream default is safe in mixed apps.
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
