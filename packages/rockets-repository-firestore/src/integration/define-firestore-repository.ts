import type { DynamicModule, PlainLiteralObject, Type } from '@nestjs/common';
import type { RepositoryBootstrap } from '@bitwild/rockets-core';
import type {
  DynamicRepositoryModule,
  RepositoryProviderOptions,
} from '@bitwild/rockets-repository';

import { FirestoreRepositoryModule } from '../firestore-repository.module';
import type { DefineFirestoreRepositoryOptions } from './define-firestore-repository.config';

/**
 * Same contract as app-local `defineTypeOrmRepository`: returns a
 * {@link RepositoryBootstrap} Rockets calls `forRoot` / `forFeature`.
 *
 * Does not read environment variables or pick a backend — the app must
 * initialize Firebase Admin before boot. Collection ids belong on the
 * entity registration row (`collection` on `defineModuleResource`).
 */
export function defineFirestoreRepository(
  options: DefineFirestoreRepositoryOptions = {},
): RepositoryBootstrap {
  return {
    name: 'firestore-bootstrap',

    forFeature(entities: RepositoryProviderOptions[]): DynamicRepositoryModule {
      return FirestoreRepositoryModule.forFeature(entities, options);
    },

    forRoot(entities: ReadonlyArray<Type<PlainLiteralObject>>): DynamicModule {
      return FirestoreRepositoryModule.forRoot({
        ...options,
        entities: [...entities],
      });
    },
  };
}
