import { DynamicModule, Module } from '@nestjs/common';

import {
  RocketsServerAuthAsyncOptions,
  RocketsServerAuthOptions,
  RocketsServerAuthModuleClass,
} from './rockets-server-auth.module-definition';

/**
 * Combined authentication module that provides all authentication options features
 *
 * This module combines the options for the following modules:
 * - JwtModule: For JWT token handling
 * - AuthenticationModule: For core authentication services
 * - AuthJwtModule: For JWT-based authentication (optional)
 * - AuthRefreshModule: For refresh token handling (optional)
 */
@Module({})
export class RocketsServerAuthModule extends RocketsServerAuthModuleClass {
  static forRoot(options: RocketsServerAuthOptions): DynamicModule {
    return super.register({ ...options, global: true });
  }

  static forRootAsync(options: RocketsServerAuthAsyncOptions): DynamicModule {
    return super.registerAsync({
      ...options,
      global: true,
    });
  }
}
