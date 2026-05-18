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
import { isRepositoryBootstrap } from './domain/interfaces/repository-bootstrap.interface';
import { SafeCrudContextInterceptor } from './infrastructure/interceptors/safe-crud-context.interceptor';
import {
  buildAppRegistrationPlan,
  type AppRegistrationPlan,
} from './infrastructure/resource/aggregate-resources';
import {
  AUTH_ADAPTER_TOKEN,
  ROCKETS_CORE_SETTINGS_TOKEN,
} from './rockets-core.constants';
import { RAW_OPTIONS_TOKEN } from './rockets-core.tokens';
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
 *   and a little startup validation for `resources` (`buildAppRegistrationPlan`).
 *
 * What it does, in order:
 * 1) `buildAppRegistrationPlan` → figures out the CRUD configs to import and which
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

  // Figure out the CRUD configs to register + the repository wiring plan +
  // any Nest module slices contributed by `defineModuleResource()` bundles.
  // Relation targets resolve through the entity index built from every
  // bundle's entities + `userMetadata.entity`, so junction tables and
  // lookup rows declared via `defineModuleResource({ entities: [...] })`
  // are first-class targets.
  const plan = buildAppRegistrationPlan({
    resources: extras.resources ?? [],
    repository: extras.repository,
    userMetadata: extras.userMetadata,
  });

  return {
    ...definition,
    global: extras.global ?? true,
    imports: [...defImports, ...createCoreImports(extras, plan)],
    controllers: [],
    providers: createCoreProviders({ providers, extras, plan }),
    exports: createCoreExports({ exports: defExports, plan }),
  };
}

function createCoreImports(
  extras: RocketsCoreOptionsExtrasInterface,
  plan: AppRegistrationPlan,
): NonNullable<DynamicModule['imports']> {
  const imports: NonNullable<DynamicModule['imports']> = [
    CqrsModule.forRoot(),
    ConfigModule.forFeature(rocketsCoreDefaultConfig),
    // Register hooks *before* repositories, otherwise repository-level hooks
    // won’t be wired and will quietly do nothing.
    HookModule.forRoot({}),
    RepositoryModule.forRoot({}),
  ];

  // Bootstrap-aware adapter: when the root `repository` knows how to
  // create its own connection (e.g. wraps `TypeOrmModule.forRoot`), pull
  // every entity it owns from the registration plan and forward them.
  // Per-entity adapter overrides on bundles are filtered out, so a
  // mixed-store app only bootstraps the entities that actually live
  // under the root adapter.
  if (isRepositoryBootstrap(extras.repository)) {
    const rootEntities = plan.entityRegistrations
      .filter((entry) => entry.module === extras.repository)
      .flatMap((entry) => entry.entities.map((row) => row.entity));
    imports.push(extras.repository.forRoot(rootEntities));
  }

  // Single registration pipeline: every dynamic-repository row (from
  // `defineResource()` bundles, `defineModuleResource()` bundles, and
  // `extras.userMetadata.entity`) was already grouped per adapter inside
  // `buildAppRegistrationPlan`. One `RepositoryModule.forFeature`
  // import per adapter group.
  for (const entry of plan.entityRegistrations) {
    imports.push(RepositoryModule.forFeature(entry));
  }

  // Nest module slices contributed by `defineModuleResource()`. Each is an
  // inline DynamicModule so the consumer composes the feature at the
  // call site instead of writing a `@Module` class just to host metadata.
  for (const featureModule of plan.nestModules) {
    imports.push(featureModule);
  }

  // CRUD routes. Upstream `CrudModule` ships a very strict request interceptor; we
  // replace it with a safer one so non-CRUD controllers still work in the same app.
  if (plan.crudResources.length) {
    imports.push(createSafeCrudRootModule());
    for (const resource of plan.crudResources) {
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
  plan: AppRegistrationPlan;
}): Provider[] {
  const providers: Provider[] = [
    ...(options.providers ?? []),
    createCoreSettingsProvider(),
    Reflector,
  ];

  if (options.extras?.auth) {
    // Auto-register the adapter as a provider AND alias the public
    // token to it via `useExisting`, so consumers do not need a manual
    // `providers: [...]` step. Skip the class registration when the
    // caller signals it is provided elsewhere (bundle resource module
    // or global module from `RocketsAuthIntegration.nestImports`):
    // re-providing here would create a second instance in core's
    // scope, which can't see deps that live in the external module.
    if (!options.extras.authExternallyProvided) {
      providers.push(options.extras.auth);
    }
    providers.push({
      provide: AUTH_ADAPTER_TOKEN,
      useExisting: options.extras.auth,
    });
  }

  return [
    ...providers,
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
    ...extractResourceProviders(options.plan.crudResources),
  ];
}

function createCoreExports(options: {
  exports: DynamicModule['exports'];
  plan: AppRegistrationPlan;
}): DynamicModule['exports'] {
  const exports: NonNullable<DynamicModule['exports']> = [
    ...(options.exports ?? []),
    ConfigModule,
    RAW_OPTIONS_TOKEN,
    AUTH_ADAPTER_TOKEN,
    ROCKETS_CORE_SETTINGS_TOKEN,
    AuthServerGuard,
  ];

  // Re-export per-resource providers (custom handlers, hooks) so the rest of the
  // app can inject them without importing every feature module twice.
  for (const resource of options.plan.crudResources) {
    exports.push(...(resource.providers ?? []));
  }

  // Re-export each `defineModuleResource()` slice as a whole module so its
  // own `exports` propagate outward. Nest does not allow re-exporting a
  // provider from a transitively-imported module by class reference — it
  // does allow re-exporting the imported module, which carries its
  // exported providers along. Without this, a provider exported by a
  // module resource would be invisible to the `inject: [...]` factory of
  // `RocketsModule.forRootAsync`.
  for (const featureModule of options.plan.nestModules) {
    exports.push(featureModule);
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
