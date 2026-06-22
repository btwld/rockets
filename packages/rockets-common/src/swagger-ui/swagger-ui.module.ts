import { DynamicModule, Module } from '@nestjs/common';

import {
  SwaggerUiAsyncOptions,
  SwaggerUiModuleClass,
  SwaggerUiOptions,
} from './swagger-ui.module-definition';

@Module({})
export class SwaggerUiModule extends SwaggerUiModuleClass {
  static register(options: SwaggerUiOptions): DynamicModule {
    return super.register(options);
  }

  static registerAsync(options: SwaggerUiAsyncOptions): DynamicModule {
    return super.registerAsync(options);
  }

  static forRoot(options: SwaggerUiOptions): DynamicModule {
    return super.register({ ...options, global: true });
  }

  static forRootAsync(options: SwaggerUiAsyncOptions): DynamicModule {
    return super.registerAsync({ ...options, global: true });
  }
}
