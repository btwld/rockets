import { createSettingsProvider } from '@concepta/nestjs-core';
import {
  ConfigurableModuleBuilder,
  DynamicModule,
  PlainLiteralObject,
  Provider,
  Type,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import type {
  RoutePolicy,
  AuthBootstrap,
  AuthBootstrapContributions,
  AuthBootstrapIdentity,
  RepositoryBootstrap,
  RepositoryModuleInterface,
  ResourceInput,
  RocketsUserMetadataConfig,
} from '@concepta/rockets-core';
import {
  RocketsCoreModule,
  AuthServerGuard,
  ROCKETS_CORE_SETTINGS_TOKEN,
  isCrudResource,
  isModuleResource,
} from '@concepta/rockets-core';
import { buildMeController } from './gateways/http/build-me-controller';
import { RocketsOptionsInterface } from './infrastructure/config/interfaces/rockets-options.interface';
import type { RocketsOptionsExtrasInterface } from './infrastructure/config/interfaces/rockets-options-extras.interface';
import type { RocketsAuthOption } from './infrastructure/config/interfaces/rockets-options-extras.interface';
import { RocketsSettingsInterface } from './infrastructure/config/interfaces/rockets-settings.interface';
import {
  ROCKETS_SERVER_SETTINGS_DEFAULTS_TOKEN,
  rocketsOptionsDefaultConfig,
} from './infrastructure/config/rockets-options-default.config';
import { RAW_OPTIONS_TOKEN } from './rockets.tokens';

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

export interface ResolvedRocketsComposition {
  readonly auth: ReadonlyArray<AuthBootstrap>;
  readonly resources: ReadonlyArray<ResourceInput>;
  readonly userMetadata?: RocketsUserMetadataConfig;
  readonly repository?: RepositoryModuleInterface | RepositoryBootstrap;
  readonly enableGlobalGuard?: boolean;
}

function resolveSingleContribution<
  Key extends keyof AuthBootstrapContributions,
>(
  bootstraps: ReadonlyArray<AuthBootstrap>,
  key: Key,
): AuthBootstrapContributions[Key] | undefined {
  const values = bootstraps
    .map((bootstrap) => bootstrap.contributes?.[key])
    .filter(
      (value): value is NonNullable<AuthBootstrapContributions[Key]> =>
        value !== undefined,
    );
  if (values.length === 0) return undefined;

  const first = values[0];
  if (values.some((value) => value !== first)) {
    throw new Error(
      `RocketsModule: auth integrations contributed conflicting ${String(
        key,
      )} defaults. Set extras.${String(
        key,
      )} explicitly to resolve the conflict.`,
    );
  }
  return first;
}

// Composition is the only consumer of identity/contributes; core refuses
// bootstraps that still carry them, so strip before handing down.
/**
 * Merges guard classes contributed by `providesAppGuard` integrations
 * into the route policy's `authGuards`.
 *
 * This is the only place it can happen: contributions are resolved by
 * THIS composition and stripped before bootstraps reach core (core
 * rejects contribution-carrying bootstraps outright). Without the
 * merge, a `defineRocketsAuth` composition — whose global guard is
 * upstream `JwtGuard`, not `AuthServerGuard` — reports every route as
 * `unguarded-app` and any declared rule aborts the boot, on the exact
 * routes the audit's documentation promises to cover.
 */
function mergeContributedAuthGuards(
  routePolicy: RoutePolicy | undefined,
  auth: readonly AuthBootstrap[],
): RoutePolicy | undefined {
  if (!routePolicy) return undefined;
  const contributed = auth.flatMap(
    (bootstrap) => bootstrap.contributes?.authGuards ?? [],
  );
  if (contributed.length === 0) return routePolicy;
  return {
    ...routePolicy,
    authGuards: [...contributed, ...(routePolicy.authGuards ?? [])],
  };
}

function toCoreAuthBootstrap({
  identity: _identity,
  contributes: _contributes,
  ...bootstrap
}: AuthBootstrap): AuthBootstrap {
  return bootstrap;
}

function resourceEntityClasses(
  resource: ResourceInput,
): ReadonlyArray<Type<PlainLiteralObject>> {
  if (isCrudResource(resource)) return [resource.meta.entityClass];
  if (isModuleResource(resource)) {
    return resource.entities.map((entry) => entry.entity);
  }
  return [];
}

// Same reference twice is idempotent (skip); the same entity defined twice
// with different configs is a mistake — fail naming both sides instead of
// silently picking one and changing behavior.
function mergeIdentityResources(
  identityResources: ReadonlyArray<ResourceInput>,
  appResources: ReadonlyArray<ResourceInput>,
): ReadonlyArray<ResourceInput> {
  const appRefs = new Set<ResourceInput>(appResources);
  const appEntities = new Set(appResources.flatMap(resourceEntityClasses));

  return identityResources.filter((resource) => {
    if (appRefs.has(resource)) return false;
    const clash = resourceEntityClasses(resource).find((entity) =>
      appEntities.has(entity),
    );
    if (clash !== undefined) {
      throw new Error(
        'RocketsModule: entity "' +
          clash.name +
          '" is provided by the auth integration (identity.resources) and ' +
          'also listed in resources[] with a different configuration. ' +
          'Remove one of the two definitions.',
      );
    }
    return true;
  });
}

// The chain authenticates into ONE user space, so its persistence has ONE
// owner. Sliced ownership (metadata from one package, repository from
// another) or two full owners are both invalid apps, not conflicts to merge.
function resolveIdentityOwner(
  bootstraps: ReadonlyArray<AuthBootstrap>,
): AuthBootstrapIdentity | undefined {
  const owners = bootstraps.filter((bootstrap) => {
    const identity = bootstrap.identity;
    return (
      identity !== undefined &&
      (identity.userMetadata !== undefined ||
        identity.repository !== undefined ||
        (identity.resources?.length ?? 0) > 0)
    );
  });
  if (owners.length > 1) {
    throw new Error(
      'RocketsModule: multiple auth integrations claim identity ownership (' +
        owners.map((owner) => owner.adapter.name).join(', ') +
        '). Exactly one integration may provide identity persistence. ' +
        'Configure the remaining integrations as credential-only adapters ' +
        'without identity ownership.',
    );
  }
  return owners[0]?.identity;
}

/** Resolve explicit app options and integration-owned defaults once. */
export function resolveRocketsComposition(
  extras: RocketsOptionsExtrasInterface = {},
): ResolvedRocketsComposition {
  const auth = normalizeAuthBootstraps(extras.auth);
  const identity = resolveIdentityOwner(auth);
  const enableGlobalGuard =
    extras.enableGlobalGuard ??
    resolveSingleContribution(auth, 'enableGlobalGuard');
  const integrationProvidesAppGuard = auth.some(
    (bootstrap) => bootstrap.contributes?.providesAppGuard === true,
  );

  if (enableGlobalGuard !== false && integrationProvidesAppGuard) {
    throw new Error(
      'RocketsModule: configure exactly one global authentication guard. ' +
        'The Rockets guard is enabled while an auth integration declares ' +
        'an integration-owned APP_GUARD. Disable the integration guard or ' +
        'set `enableGlobalGuard: false`.',
    );
  }

  if (auth.length > 1 && enableGlobalGuard === false) {
    throw new Error(
      'RocketsModule: a multi-adapter authentication chain requires the ' +
        'Rockets global guard. Multiple Nest APP_GUARD providers are ' +
        'cumulative and cannot provide adapter fallback. Set ' +
        '`enableGlobalGuard: true` and disable integration-owned global ' +
        'authentication guards.',
    );
  }

  // A contribution may swap the global guard, never remove it: honoring a
  // contributed `false` with no declared replacement would silently publish
  // every route. Opting out of a guard entirely is the app's call alone.
  if (
    enableGlobalGuard === false &&
    extras.enableGlobalGuard !== false &&
    !integrationProvidesAppGuard
  ) {
    throw new Error(
      'RocketsModule: an auth integration contributed enableGlobalGuard: ' +
        'false without declaring a replacement guard ' +
        '(contributes.providesAppGuard). For an intentionally public API, ' +
        'set enableGlobalGuard: false explicitly on the module options.',
    );
  }

  const appResources = extras.resources ?? [];
  return {
    auth,
    resources: [
      ...mergeIdentityResources(identity?.resources ?? [], appResources),
      ...appResources,
    ],
    userMetadata: extras.userMetadata ?? identity?.userMetadata,
    repository: extras.repository ?? identity?.repository,
    enableGlobalGuard,
  };
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
  const composition = resolveRocketsComposition(options.extras);
  return [
    ...options.imports,
    RocketsCoreModule.forRootAsync({
      inject: [RAW_OPTIONS_TOKEN],
      useFactory: (opts: RocketsOptionsInterface) => ({
        swagger: opts.swagger,
      }),
      auth: composition.auth.map(toCoreAuthBootstrap),
      userMetadata: composition.userMetadata,
      repository: composition.repository,
      resources: composition.resources,
      handlers: options.extras?.handlers,
      accessControl: options.extras?.accessControl,
      routePolicy: mergeContributedAuthGuards(
        options.extras?.routePolicy,
        composition.auth,
      ),
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
  const composition = resolveRocketsComposition(options.extras);
  const controllers: DynamicModule['controllers'] = [];

  if (composition.userMetadata && !disableController.me) {
    controllers.push(buildMeController(composition.userMetadata));
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
    settingsKey: ROCKETS_SERVER_SETTINGS_DEFAULTS_TOKEN,
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
  const composition = resolveRocketsComposition(options.extras);
  const providers: Provider[] = [
    ...(options.providers ?? []),
    rocketsOptionsDefaultConfig,
    createRocketsSettingsProvider(),
  ];

  if (composition.enableGlobalGuard !== false) {
    providers.push({
      provide: APP_GUARD,
      useClass: AuthServerGuard,
    });
  }

  return providers;
}
