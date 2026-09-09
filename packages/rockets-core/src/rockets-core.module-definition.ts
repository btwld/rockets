import { CoreModule, createSettingsProvider } from '@concepta/nestjs-core';
import {
  ConfigurableModuleBuilder,
  DynamicModule,
  Provider,
  Type,
} from '@nestjs/common';
import { APP_INTERCEPTOR, DiscoveryModule, Reflector } from '@nestjs/core';
import { CqrsModule } from '@nestjs/cqrs';
import { RepositoryModule } from '@concepta/nestjs-repository';
import { CrudModule } from '@concepta/nestjs-crud';
import { AuthUserContextOverlay } from '@concepta/nestjs-authentication';
import type { RocketsResourceConfig } from './domain/interfaces/rockets-resource.interface';
import { collectBootstrapForRootImports } from './infrastructure/repository/collect-bootstrap-for-root-imports';
import {
  buildAppRegistrationPlan,
  type AppRegistrationPlan,
} from './infrastructure/resource/aggregate-resources';
import {
  AUTH_ADAPTERS_TOKEN,
  ROCKETS_CORE_SETTINGS_TOKEN,
} from './rockets-core.constants';
import type { AuthBootstrap } from './domain/interfaces/auth-bootstrap.interface';
import type { AuthAdapterInterface } from './domain/interfaces/auth-adapter.interface';
import { RAW_OPTIONS_TOKEN } from './rockets-core.tokens';
import { RocketsCoreOptionsInterface } from './infrastructure/config/interfaces/rockets-core-options.interface';
import { RocketsCoreOptionsExtrasInterface } from './infrastructure/config/interfaces/rockets-core-options-extras.interface';
import { RocketsCoreSettingsInterface } from './infrastructure/config/interfaces/rockets-core-settings.interface';
import {
  ROCKETS_CORE_SETTINGS_DEFAULTS_TOKEN,
  rocketsCoreDefaultConfig,
} from './infrastructure/config/rockets-core-options-default.config';
import { AuthServerGuard } from './infrastructure/guards/auth-server.guard';
import {
  RouteAuditService,
  ROCKETS_ROUTE_POLICY_TOKEN,
} from './infrastructure/audit';
import { ActorOverlay } from './infrastructure/interceptors/actor.overlay';
import { SchemaValidatorConflictCheck } from './infrastructure/validation/schema-validator-conflict.check';
import { UpsertUserMetadataHandler } from './application/commands/handlers/upsert-user-metadata.handler';
import { GetUserMetadataHandler } from './application/queries/handlers/get-user-metadata.handler';
import { SwaggerUiModule } from './common';
import { buildAccessControlImport } from './infrastructure/access-control/build-access-control-import';

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
    accessControl: extras.accessControl !== undefined,
    enforceGrants: extras.accessControl?.enforceGrants === true,
  });

  return {
    ...definition,
    global: extras.global ?? true,
    imports: [...defImports, ...createCoreImports(extras, plan)],
    controllers: [],
    providers: createCoreProviders({ providers, extras, plan }),
    exports: createCoreExports({ exports: defExports, plan, extras }),
  };
}

function createCoreImports(
  extras: RocketsCoreOptionsExtrasInterface,
  plan: AppRegistrationPlan,
): NonNullable<DynamicModule['imports']> {
  const imports: NonNullable<DynamicModule['imports']> = [
    CqrsModule.forRoot(),
    // Register hooks *before* repositories, otherwise repository-level hooks
    // won’t be wired and will quietly do nothing. RocketsAppModule provides
    // the hook feature (HookResolverService) globally.
    CoreModule.forRoot(),
    RepositoryModule.forRoot({}),
  ];

  // Bootstrap-aware adapters: call `forRoot` once per distinct bootstrap
  // that owns entities in the plan (root SQL + per-entity Firestore, etc.).
  for (const bootstrapImport of collectBootstrapForRootImports(plan)) {
    imports.push(bootstrapImport);
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

  // CRUD routes. Upstream `CrudContextOverlay.attach()` no-ops on handlers
  // without CRUD metadata (nestjs-crud `5249672`), so mixed CRUD + custom
  // controllers share one `CrudModule.forRoot()` safely.
  if (plan.crudResources.length) {
    imports.push(
      CrudModule.forRoot({
        settings: {},
      }),
    );
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

  for (const bootstrap of normalizeAuthBootstraps(extras.auth)) {
    if (bootstrap.forRoot !== undefined) {
      imports.push(bootstrap.forRoot());
    }
  }

  // Access control is opt-in: no `accessControl` config → no ACL module,
  // guard, or provider is registered at all.
  if (extras.accessControl) {
    // Bundle-declared `acl.query` services are merged with any the app
    // listed itself, so a resource cannot declare a query service and
    // then 500 at request time because nobody registered it. They must
    // land on `AccessControlModule` specifically: the upstream guard
    // strict-resolves from its own host module.
    imports.push(
      buildAccessControlImport(
        extras.accessControl,
        plan.accessControlQueryServices,
      ),
    );
  }

  // `RouteAuditService` injects DiscoveryService/MetadataScanner, which
  // only exist once DiscoveryModule is imported. The service is always
  // registered (its schema-pipe check needs no policy).
  imports.push(DiscoveryModule);

  return imports;
}

function createCoreSettingsProvider(): Provider {
  return createSettingsProvider<
    RocketsCoreSettingsInterface,
    RocketsCoreOptionsInterface
  >({
    settingsToken: ROCKETS_CORE_SETTINGS_TOKEN,
    optionsToken: RAW_OPTIONS_TOKEN,
    settingsKey: ROCKETS_CORE_SETTINGS_DEFAULTS_TOKEN,
  });
}

function createCoreProviders(options: {
  providers?: Provider[];
  extras?: RocketsCoreOptionsExtrasInterface;
  plan: AppRegistrationPlan;
}): Provider[] {
  const providers: Provider[] = [
    ...(options.providers ?? []),
    rocketsCoreDefaultConfig,
    createCoreSettingsProvider(),
    Reflector,
  ];

  const authBootstraps = normalizeAuthBootstraps(options.extras?.auth);
  providers.push(...buildAuthChainProviders(authBootstraps));

  // Gate each handler on its own override, falling back to the built-in only
  // when a metadata contract exists. The defaults inject the user-metadata
  // dynamic repository, which is registered only via `userMetadata` — pulling
  // one in because the *other* handler was overridden would fail DI at boot.
  const hasUserMetadata = options.extras?.userMetadata !== undefined;
  const userMetadataProviders: Provider[] = [];

  const upsertUserMetadata =
    options.extras?.handlers?.upsertUserMetadata ??
    (hasUserMetadata ? UpsertUserMetadataHandler : undefined);
  if (upsertUserMetadata !== undefined) {
    userMetadataProviders.push(upsertUserMetadata);
  }

  const getUserMetadata =
    options.extras?.handlers?.getUserMetadata ??
    (hasUserMetadata ? GetUserMetadataHandler : undefined);
  if (getUserMetadata !== undefined) {
    userMetadataProviders.push(getUserMetadata);
  }

  // The bootstrap audit always runs: its schema-pipe check (a parameter
  // declaring `schema` that no StandardSchemaValidationPipe reaches) is a
  // defect in any app. The route POLICY is opt-in — declaring one turns
  // the policy rules on. Contribution-carrying bootstraps never reach
  // here (core rejects them above), so guard classes contributed by
  // `providesAppGuard` integrations are merged into the policy by the
  // SERVER composition before forwarding.
  const routePolicy = options.extras?.routePolicy;
  const routeAuditProviders: Provider[] = [
    RouteAuditService,
    ...(routePolicy
      ? [{ provide: ROCKETS_ROUTE_POLICY_TOKEN, useValue: routePolicy }]
      : []),
  ];

  return [
    ...providers,
    ...routeAuditProviders,
    AuthServerGuard,
    // Makes the authenticated user available to the CRUD system (`@AuthUser()` in upstream v8).
    // (When you use the full auth module, that module may register the same thing — don’t double up.)
    { provide: APP_INTERCEPTOR, useClass: AuthUserContextOverlay },
    // Adds a simple “who did this?” id for repository hooks/audit (not the full user profile).
    { provide: APP_INTERCEPTOR, useClass: ActorOverlay },
    // Rejects a global StandardSchemaValidationPipe at boot: every Rockets
    // route validates with its own per-route pipe, a global one would run
    // each body through the schema twice.
    SchemaValidatorConflictCheck,
    // Built-in user-metadata CQRS (override in `extras.handlers` if you need to customize storage)
    ...userMetadataProviders,
    ...(options.extras?.providers ?? []),
    ...extractResourceProviders(options.plan.crudResources),
  ];
}

function createCoreExports(options: {
  exports: DynamicModule['exports'];
  plan: AppRegistrationPlan;
  extras?: RocketsCoreOptionsExtrasInterface;
}): DynamicModule['exports'] {
  const exports: NonNullable<DynamicModule['exports']> = [
    ...(options.exports ?? []),
    RAW_OPTIONS_TOKEN,
    AUTH_ADAPTERS_TOKEN,
    ROCKETS_CORE_SETTINGS_TOKEN,
    AuthServerGuard,
  ];

  // The service is always registered, so it is always exported: a
  // registered but unexported provider only satisfies `app.get()` — a
  // consumer module's `inject: [RouteAuditService]` failed DI (review
  // round 4).
  exports.push(RouteAuditService);

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

function normalizeAuthBootstraps(
  input: RocketsCoreOptionsExtrasInterface['auth'] | undefined,
): ReadonlyArray<AuthBootstrap> {
  if (input === undefined) return [];
  const entries = Array.isArray(input) ? input : [input];
  // Core would silently drop these — refuse instead of booting an app that
  // is missing the persistence/guard defaults the integration declared.
  for (const bootstrap of entries) {
    if (
      bootstrap.identity !== undefined ||
      bootstrap.contributes !== undefined
    ) {
      throw new Error(
        'RocketsCoreModule: auth bootstrap "' +
          bootstrap.adapter.name +
          '" carries identity/contributes, which only @concepta/rockets ' +
          '(createServer / RocketsModule) resolves. Use createServer(), or ' +
          'pass userMetadata/repository/resources explicitly to core.',
      );
    }
  }
  return entries;
}

/**
 * Wire `AUTH_ADAPTERS_TOKEN` — adapter instances must be exported from
 * modules core imported (`forRoot`) or reachable globally (built-in auth).
 */
function buildAuthChainProviders(
  bootstraps: ReadonlyArray<AuthBootstrap>,
): Provider[] {
  const chain = bootstraps.map((bootstrap) => bootstrap.adapter);
  return [
    {
      provide: AUTH_ADAPTERS_TOKEN,
      useFactory: collectAdapters,
      inject: [...chain],
    },
  ];
}

/**
 * Collects all injected adapter instances into a typed array.
 * Extracted as a named function so it can be unit-tested independently.
 */
export function collectAdapters(
  ...instances: AuthAdapterInterface[]
): ReadonlyArray<AuthAdapterInterface> {
  return instances;
}
