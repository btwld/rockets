import {
  ConfigurableModuleBuilder,
  DynamicModule,
  Provider,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

import { createSettingsProvider } from '@concepta/nestjs-common';

import { AccessControlGuard } from './access-control.guard';
import { accessControlDefaultConfig } from './config/acess-control-default.config';
import { ACCESS_CONTROL_MODULE_SETTINGS_TOKEN } from './constants';
import { AccessControlFilter } from './filter/access-control.filter';
import { AccessControlOptionsExtrasInterface } from './interfaces/access-control-options-extras.interface';
import { AccessControlOptionsInterface } from './interfaces/access-control-options.interface';
import { AccessControlSettingsInterface } from './interfaces/access-control-settings.interface';
import { AccessControlService } from './services/access-control.service';

const RAW_OPTIONS_TOKEN = Symbol('__ACCESS_CONTROL_MODULE_RAW_OPTIONS_TOKEN__');

export const {
  ConfigurableModuleClass: AccessControlModuleClass,
  OPTIONS_TYPE: ACCESS_CONTROL_OPTIONS_TYPE,
  ASYNC_OPTIONS_TYPE: ACCESS_CONTROL_ASYNC_OPTIONS_TYPE,
} = new ConfigurableModuleBuilder<AccessControlOptionsInterface>({
  moduleName: 'AccessControl',
  optionsInjectionToken: RAW_OPTIONS_TOKEN,
})
  .setExtras<AccessControlOptionsExtrasInterface>(
    { global: false },
    definitionTransform,
  )
  .build();

export type AccessControlOptions = Omit<
  typeof ACCESS_CONTROL_OPTIONS_TYPE,
  'global'
>;

export type AccessControlAsyncOptions = Omit<
  typeof ACCESS_CONTROL_ASYNC_OPTIONS_TYPE,
  'global'
>;

function definitionTransform(
  definition: DynamicModule,
  extras: AccessControlOptionsExtrasInterface,
): DynamicModule {
  const { providers = [] } = definition;
  const { global = false, imports, queryServices = [] } = extras;

  return {
    ...definition,
    global,
    imports: createAccessControlImports({ imports }),
    providers: createAccessControlProviders({
      providers: [...providers, ...queryServices],
    }),
    exports: [ConfigModule, RAW_OPTIONS_TOKEN, ...createAccessControlExports()],
  };
}

export function createAccessControlImports(
  overrides?: Pick<AccessControlOptions, 'imports'>,
): DynamicModule['imports'] {
  const imports = [ConfigModule.forFeature(accessControlDefaultConfig)];

  if (overrides?.imports?.length) {
    return [...imports, ...overrides.imports];
  } else {
    return imports;
  }
}

export function createAccessControlExports() {
  return [
    ACCESS_CONTROL_MODULE_SETTINGS_TOKEN,
    AccessControlService,
    AccessControlFilter,
    AccessControlGuard,
  ];
}

export function createAccessControlProviders(options: {
  overrides?: AccessControlOptions;
  providers?: Provider[];
}): Provider[] {
  return [
    ...(options.providers ?? []),
    createAccessControlSettingsProvider(options.overrides),
    createAccessControlServiceProvider(options.overrides),
    createAccessControlAppGuardProvider(options.overrides),
    createAccessControlAppFilterProvider(options.overrides),
    AccessControlFilter,
    AccessControlGuard,
  ];
}

export function createAccessControlSettingsProvider(
  optionsOverrides?: AccessControlOptions,
): Provider {
  return createSettingsProvider<
    AccessControlSettingsInterface,
    AccessControlOptionsInterface
  >({
    settingsToken: ACCESS_CONTROL_MODULE_SETTINGS_TOKEN,
    optionsToken: RAW_OPTIONS_TOKEN,
    settingsKey: accessControlDefaultConfig.KEY,
    optionsOverrides,
  });
}

export function createAccessControlServiceProvider(
  optionsOverrides?: AccessControlOptions,
): Provider {
  return {
    provide: AccessControlService,
    inject: [RAW_OPTIONS_TOKEN],
    useFactory: async (options: AccessControlOptionsInterface) =>
      optionsOverrides?.service ??
      options.service ??
      new AccessControlService(),
  };
}

export function createAccessControlAppGuardProvider(
  optionsOverrides?: AccessControlOptions,
): Provider {
  return {
    provide: APP_GUARD,
    inject: [RAW_OPTIONS_TOKEN, AccessControlGuard],
    useFactory: async (
      options: AccessControlOptionsInterface,
      defaultGuard: AccessControlGuard,
    ) => {
      // get app guard from the options
      const appGuard = optionsOverrides?.appGuard ?? options?.appGuard;

      // is app guard explicitly false?
      if (appGuard === false) {
        // yes, don't set a guard
        return null;
      } else {
        // return app guard if set, or fall back to default
        return appGuard ?? defaultGuard;
      }
    },
  };
}

export function createAccessControlAppFilterProvider(
  optionsOverrides?: AccessControlOptions,
): Provider {
  return {
    provide: APP_INTERCEPTOR,
    inject: [RAW_OPTIONS_TOKEN, AccessControlFilter],
    useFactory: async (
      options: AccessControlOptionsInterface,
      defaultFilter: AccessControlFilter,
    ) => {
      // get app filter from the options
      const appFilter = optionsOverrides?.appFilter ?? options?.appFilter;

      // is app filter explicitly false?
      if (appFilter === false) {
        // yes, don't set a filter
        return null;
      } else {
        // return app filter if set, or fall back to default
        return appFilter ?? defaultFilter;
      }
    },
  };
}
