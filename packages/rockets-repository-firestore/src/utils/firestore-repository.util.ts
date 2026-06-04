import type { Provider } from '@nestjs/common';
import { getApp, getApps } from 'firebase-admin/app';
import {
  getDynamicRepositoryToken,
  type DynamicRepositoryModule,
} from '@bitwild/rockets-repository';

import { AdminFirestoreBackend } from '../backends/admin-firestore.backend';
import { FirestoreRepositoryModule } from '../firestore-repository.module';
import type { FirestoreBackend } from '../interfaces/firestore-backend.interface';
import type { FirestoreProviderOptions } from '../interfaces/firestore-provider-options.interface';
import { buildFirestoreEntityMetadata } from '../repository/firestore-entity-metadata';
import { FirestoreRepository } from '../repository/firestore-repository';

export function resolveFirestoreBackend(
  backend?: FirestoreBackend,
): FirestoreBackend {
  if (backend) {
    return backend;
  }

  if (getApps().length === 0) {
    throw new Error(
      'Firestore: initialize Firebase Admin before RepositoryModule.forRoot ' +
        '(call ensureFirebaseAdminApp() or wire defineFirebaseAuth() in the app).',
    );
  }

  getApp();
  return new AdminFirestoreBackend();
}

export function createFirestoreProvider(
  options: FirestoreProviderOptions,
  backend: FirestoreBackend,
): Provider {
  const collection = options.collection ?? options.key;

  return {
    provide: getDynamicRepositoryToken(options.key),
    useFactory: () => {
      const metadata = buildFirestoreEntityMetadata(
        options.entity,
        collection,
        options.softDeleteField,
      );
      return new FirestoreRepository({
        entityKey: options.key,
        collection,
        metadata,
        backend,
      });
    },
  };
}

export function createFirestoreFeatureModule(
  entities: FirestoreProviderOptions[],
  backend?: FirestoreBackend,
): DynamicRepositoryModule {
  const resolvedBackend = resolveFirestoreBackend(backend);

  return {
    module: FirestoreRepositoryModule,
    providers: entities.map((entity) =>
      createFirestoreProvider(entity, resolvedBackend),
    ),
    exports: entities.map((entity) => getDynamicRepositoryToken(entity.key)),
  };
}
