import { ConfigurableModuleBuilder, DynamicModule } from '@nestjs/common';
import { UserMetadataConfigInterface } from '../../../shared/interfaces/rockets-auth-options-extras.interface';

export const RAW_USER_METADATA_OPTIONS_TOKEN = Symbol(
  '__ROCKETS_AUTH_USER_METADATA_MODULE_RAW_OPTIONS_TOKEN__',
);

export const {
  ConfigurableModuleClass: RocketsAuthUserMetadataModuleClass,
  OPTIONS_TYPE: ROCKETS_AUTH_USER_METADATA_MODULE_OPTIONS_TYPE,
  ASYNC_OPTIONS_TYPE: ROCKETS_AUTH_USER_METADATA_MODULE_ASYNC_OPTIONS_TYPE,
} = new ConfigurableModuleBuilder<UserMetadataConfigInterface>({
  moduleName: 'RocketsAuthUserMetadata',
  optionsInjectionToken: RAW_USER_METADATA_OPTIONS_TOKEN,
})
  .setExtras<{ global?: boolean }>({ global: false }, definitionTransform)
  .build();

export type RocketsAuthUserMetadataOptions =
  typeof ROCKETS_AUTH_USER_METADATA_MODULE_OPTIONS_TYPE;
export type RocketsAuthUserMetadataAsyncOptions =
  typeof ROCKETS_AUTH_USER_METADATA_MODULE_ASYNC_OPTIONS_TYPE;

function definitionTransform(
  definition: DynamicModule,
  extras: { global?: boolean },
): DynamicModule {
  return {
    ...definition,
    global: extras.global,
  };
}
