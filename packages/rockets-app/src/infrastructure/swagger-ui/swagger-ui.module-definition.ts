import {
  ConfigurableModuleBuilder,
  DynamicModule,
  Provider,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { createSettingsProvider } from '../utils/create-settings-provider';

import { swaggerUiDefaultConfig } from './config/swagger-ui-default.config';
import { SwaggerUiOptionsExtrasInterface } from './interfaces/swagger-ui-options-extras.interface';
import { SwaggerUiOptionsInterface } from './interfaces/swagger-ui-options.interface';
import { SwaggerUiSettingsInterface } from './interfaces/swagger-ui-settings.interface';
import {
  SWAGGER_UI_MODULE_DOCUMENT_BUILDER_TOKEN,
  SWAGGER_UI_MODULE_SETTINGS_TOKEN,
} from './swagger-ui.constants';
import { SwaggerUiService } from './swagger-ui.service';
import { createDefaultDocumentBuilder } from './utils/create-default-document-builder';

const SWAGGER_UI_MODULE_RAW_OPTIONS_TOKEN = Symbol(
  '__SWAGGER_UI_MODULE_RAW_OPTIONS_TOKEN__',
);

export const {
  ConfigurableModuleClass: SwaggerUiModuleClass,
  OPTIONS_TYPE: SWAGGER_UI_OPTIONS_TYPE,
  ASYNC_OPTIONS_TYPE: SWAGGER_UI_ASYNC_OPTIONS_TYPE,
} = new ConfigurableModuleBuilder<SwaggerUiOptionsInterface>({
  moduleName: 'SwaggerUi',
  optionsInjectionToken: SWAGGER_UI_MODULE_RAW_OPTIONS_TOKEN,
})
  .setExtras<SwaggerUiOptionsExtrasInterface>(
    { global: false },
    definitionTransform,
  )
  .build();

export type SwaggerUiOptions = Omit<typeof SWAGGER_UI_OPTIONS_TYPE, 'global'>;
export type SwaggerUiAsyncOptions = Omit<
  typeof SWAGGER_UI_ASYNC_OPTIONS_TYPE,
  'global'
>;

function definitionTransform(
  definition: DynamicModule,
  extras: SwaggerUiOptionsExtrasInterface,
): DynamicModule {
  const { providers = [] } = definition;

  return {
    ...definition,
    ...extras,
    imports: [ConfigModule.forFeature(swaggerUiDefaultConfig)],
    providers: createSwaggerUiProviders({ providers }),
    exports: createSwaggerUiExports(),
  };
}

export function createSwaggerUiExports(): NonNullable<
  DynamicModule['exports']
> {
  return [
    ConfigModule,
    SWAGGER_UI_MODULE_RAW_OPTIONS_TOKEN,
    SWAGGER_UI_MODULE_SETTINGS_TOKEN,
    SwaggerUiService,
  ];
}

export function createSwaggerUiProviders(options: {
  providers?: Provider[];
}): Provider[] {
  return [
    ...(options.providers ?? []),
    SwaggerUiService,
    createSwaggerUiSettingsProvider(),
    createSwaggerUiDocumentBuilderProvider(),
  ];
}

export function createSwaggerUiSettingsProvider(): Provider {
  return createSettingsProvider<
    SwaggerUiSettingsInterface,
    SwaggerUiOptionsInterface
  >({
    settingsToken: SWAGGER_UI_MODULE_SETTINGS_TOKEN,
    optionsToken: SWAGGER_UI_MODULE_RAW_OPTIONS_TOKEN,
    settingsKey: swaggerUiDefaultConfig.KEY,
  });
}

export function createSwaggerUiDocumentBuilderProvider(): Provider {
  return {
    provide: SWAGGER_UI_MODULE_DOCUMENT_BUILDER_TOKEN,
    inject: [
      SWAGGER_UI_MODULE_RAW_OPTIONS_TOKEN,
      SWAGGER_UI_MODULE_SETTINGS_TOKEN,
    ],
    useFactory: async (
      options: SwaggerUiOptionsInterface,
      settings: SwaggerUiSettingsInterface,
    ) => {
      if (options.documentBuilder) {
        return options.documentBuilder;
      }

      return createDefaultDocumentBuilder(settings);
    },
  };
}
