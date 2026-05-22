import { getApp, getApps } from 'firebase-admin/app';
import {
  getDynamicRepositoryToken,
  type DynamicRepositoryModule,
} from '@concepta/nestjs-repository';
import type { Provider } from '@nestjs/common';

import { AdminFirestoreBackend } from '../backends/admin-firestore.backend';
import { InMemoryFirestoreBackend } from '../backends/in-memory-firestore.backend';
import { FirestoreRepositoryModule } from '../firestore-repository.module';
import type { FirestoreBackend } from '../interfaces/firestore-backend.interface';
import type { FirestoreProviderOptions } from '../interfaces/firestore-provider-options.interface';
import { buildFirestoreEntityMetadata } from '../repository/firestore-entity-metadata';
import { FirestoreRepository } from '../repository/firestore-repository';
import { resolveFirestoreCollection } from './firestore-collection.registry';

function resolveBackend(): FirestoreBackend {
  if (process.env.FIREBASE_FIRESTORE_USE_FAKE === 'true') {
    return new InMemoryFirestoreBackend();
  }

  if (getApps().length === 0) {
    throw new Error(
      'Firestore: initialize Firebase Admin before boot ' +
        '(call ensureFirebaseAdminApp() from @bitwild/rockets-repository-firestore, ' +
        'or set FIREBASE_FIRESTORE_USE_FAKE=true).',
    );
  }

  getApp();
  return new AdminFirestoreBackend();
}

export function createFirestoreProvider(
  options: FirestoreProviderOptions,
  backend: FirestoreBackend,
): Provider {
  const collection =
    options.collection ??
    resolveFirestoreCollection(options.key) ??
    options.key;

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
): DynamicRepositoryModule {
  const backend = resolveBackend();

  return {
    module: FirestoreRepositoryModule,
    providers: entities.map((entity) => createFirestoreProvider(entity, backend)),
    exports: entities.map((entity) => getDynamicRepositoryToken(entity.key)),
  };
}
