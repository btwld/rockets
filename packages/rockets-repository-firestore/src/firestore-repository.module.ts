import { Global, Module } from '@nestjs/common';
import type { DynamicRepositoryModule } from '@concepta/nestjs-repository';

import { FIRESTORE_REPOSITORY_MODULE_NAME } from './constants/firestore-repository.constants';
import type { FirestoreProviderOptions } from './interfaces/firestore-provider-options.interface';
import { createFirestoreFeatureModule } from './utils/firestore-repository.util';

@Global()
@Module({})
export class FirestoreRepositoryModule {
  static forFeature(
    entities: FirestoreProviderOptions[],
  ): DynamicRepositoryModule {
    return createFirestoreFeatureModule(entities);
  }
}

Object.defineProperty(FirestoreRepositoryModule, 'name', {
  value: FIRESTORE_REPOSITORY_MODULE_NAME,
  configurable: true,
});
