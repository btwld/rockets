import { DynamicModule, Module } from '@nestjs/common';
import {
  RocketsModuleClass,
  RocketsOptions,
  RocketsAsyncOptions,
} from './rockets.module-definition';

@Module({})
export class RocketsModule extends RocketsModuleClass {
  static forRoot(options: RocketsOptions): DynamicModule {
    return super.register({ ...options, global: true });
  }

  static forRootAsync(options: RocketsAsyncOptions): DynamicModule {
    return super.registerAsync({ ...options, global: true });
  }
}
