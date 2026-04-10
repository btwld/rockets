import { Module, DynamicModule } from '@nestjs/common';
import {
  RocketsCoreModuleClass,
  RocketsCoreOptions,
  RocketsCoreAsyncOptions,
} from './rockets-core.module-definition';

@Module({})
export class RocketsCoreModule extends RocketsCoreModuleClass {
  static forRoot(options: RocketsCoreOptions): DynamicModule {
    return super.register({ ...options, global: true });
  }

  static forRootAsync(options: RocketsCoreAsyncOptions): DynamicModule {
    return super.registerAsync({ ...options, global: true });
  }
}
