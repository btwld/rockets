import { ConfigurableModuleBuilder, DynamicModule } from '@nestjs/common';
import { UserMetadataConfigInterface } from '../../../shared/interfaces/rockets-auth-options-extras.interface';
import { USER_METADATA_REPOSITORY_TOKEN } from '../domain/constants/user-domain.tokens';
import { UserMetadataRepository } from '../infrastructure/persistence/user-metadata.repository';
import { SaveUserMetadataHandler } from '../application/commands/handlers/save-user-metadata.handler';
import { GetUserMetadataHandler } from '../application/queries/handlers/get-user-metadata.handler';

export const RAW_USER_METADATA_OPTIONS_TOKEN = Symbol(
  '__ROCKETS_USER_METADATA_MODULE_RAW_OPTIONS_TOKEN__',
);

type UserMetadataExtrasInterface = UserMetadataConfigInterface & {
  global?: boolean;
};

export const {
  ConfigurableModuleClass: RocketsAuthUserMetadataModuleClass,
  OPTIONS_TYPE: ROCKETS_AUTH_USER_METADATA_MODULE_OPTIONS_TYPE,
  ASYNC_OPTIONS_TYPE: ROCKETS_AUTH_USER_METADATA_MODULE_ASYNC_OPTIONS_TYPE,
} = new ConfigurableModuleBuilder<UserMetadataConfigInterface>({
  moduleName: 'RocketsAuthUserMetadata',
  optionsInjectionToken: RAW_USER_METADATA_OPTIONS_TOKEN,
})
  .setExtras<Partial<UserMetadataExtrasInterface>>(
    { global: false },
    definitionTransform,
  )
  .build();

export type RocketsAuthUserMetadataOptions =
  typeof ROCKETS_AUTH_USER_METADATA_MODULE_OPTIONS_TYPE;
export type RocketsAuthUserMetadataAsyncOptions =
  typeof ROCKETS_AUTH_USER_METADATA_MODULE_ASYNC_OPTIONS_TYPE;

function definitionTransform(
  definition: DynamicModule,
  extras: Partial<UserMetadataExtrasInterface>,
): DynamicModule {
  // Rename to avoid shadowing the CJS `exports` object — TypeScript compiles
  // module-level `export const X` references to `exports.X`, which the local
  // destructured `exports` array would intercept and resolve to `undefined`.
  const { imports = [], providers = [], exports: defExports = [] } = definition;

  return {
    ...definition,
    global: extras.global,
    imports: [...imports, ...(extras.imports ?? [])],
    providers: [
      ...providers,
      {
        provide: USER_METADATA_REPOSITORY_TOKEN,
        useClass: UserMetadataRepository,
      },
      SaveUserMetadataHandler,
      GetUserMetadataHandler,
    ],
    exports: [
      ...defExports,
      RAW_USER_METADATA_OPTIONS_TOKEN,
      USER_METADATA_REPOSITORY_TOKEN,
      SaveUserMetadataHandler,
      GetUserMetadataHandler,
    ],
  };
}
