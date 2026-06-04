import { Global, Module, type DynamicModule } from '@nestjs/common';
import type { DynamicRepositoryModule } from '@bitwild/rockets-repository';

import { FIRESTORE_REPOSITORY_MODULE_NAME } from './constants/firestore-repository.constants';
import type { FirestoreProviderOptions } from './interfaces/firestore-provider-options.interface';
import type {
  FirestoreRepositoryModuleOptions,
  FirestoreRepositoryRootOptions,
} from './interfaces/firestore-repository-module-options.interface';
import {
  createFirestoreFeatureModule,
  resolveFirestoreBackend,
} from './utils/firestore-repository.util';

@Global()
@Module({})
export class FirestoreRepositoryModule {
  static forRoot(options: FirestoreRepositoryRootOptions): DynamicModule {
    resolveFirestoreBackend(options.backend);

    return {
      module: FirestoreRepositoryModule,
      global: true,
    };
  }

  static forFeature(
    entities: FirestoreProviderOptions[],
    options?: FirestoreRepositoryModuleOptions,
  ): DynamicRepositoryModule {
    return createFirestoreFeatureModule(entities, options?.backend);
  }
}

Object.defineProperty(FirestoreRepositoryModule, 'name', {
  value: FIRESTORE_REPOSITORY_MODULE_NAME,
  configurable: true,
});
