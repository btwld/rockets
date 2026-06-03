import type { DynamicModule } from '@nestjs/common';
import type { ModuleResource } from '../../../domain/interfaces/module-resource.interface';

export function materialiseModuleResource(
  bundle: ModuleResource,
): DynamicModule {
  class RocketsModuleResource {}

  return {
    module: RocketsModuleResource,
    imports: bundle.imports,
    controllers: bundle.controllers,
    providers: bundle.providers ? [...bundle.providers] : undefined,
    exports: bundle.exports,
  };
}
