import { Global, Module, type DynamicModule } from '@nestjs/common';
import { CoreModule } from '@concepta/nestjs-core';
import type { DynamicRepositoryModule } from '@concepta/nestjs-repository';

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
// TypeORM injects HookResolverService as optional and fail-opens when
// CoreModule is absent. Required inject here would break a module-factory
// consumer that does not go through RocketsCoreModule, so this import is
// what keeps that path fail-closed. Nest tokens each CoreModule.forRoot()
// call separately; HookResolverService is ctx-driven, so a second instance
// still resolves hook classes.
@Module({ imports: [CoreModule.forRoot()] })
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
