import { DynamicModule, Module } from '@nestjs/common';

import {
  RocketsAuthUserMetadataOptions,
  RocketsAuthUserMetadataAsyncOptions,
  RocketsAuthUserMetadataModuleClass,
} from './rockets-auth-user-metadata.module-definition';

/**
 * RocketsAuth User Metadata Module
 *
 * This module follows the pattern established in rockets-auth.module.ts
 * by extending the ConfigurableModuleClass and providing forRoot/forRootAsync methods.
 */

@Module({})
export class RocketsAuthUserMetadataModule extends RocketsAuthUserMetadataModuleClass {
  static forRoot(options: RocketsAuthUserMetadataOptions): DynamicModule {
    return super.register({ ...options, global: true });
  }

  static forRootAsync(
    options: RocketsAuthUserMetadataAsyncOptions,
  ): DynamicModule {
    return super.registerAsync({
      ...options,
      global: true,
    });
  }
}
