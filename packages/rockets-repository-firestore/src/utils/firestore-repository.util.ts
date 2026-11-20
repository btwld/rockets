import { randomUUID } from 'node:crypto';
import type { Provider } from '@nestjs/common';
import { getApp, getApps } from 'firebase-admin/app';
import { HookResolverService } from '@concepta/nestjs-core';
import {
  getDynamicRepositoryToken,
  type DynamicRepositoryModule,
} from '@concepta/nestjs-repository';

import { AdminFirestoreBackend } from '../backends/admin-firestore.backend';
import { FIRESTORE_BACKEND } from '../constants/firestore-repository.constants';
import { FIRESTORE_DEFAULT_TRANSACTION_KEY } from '../constants/firestore-transaction.constants';
import { FirestoreRepositoryModule } from '../firestore-repository.module';
import type { FirestoreBackend } from '../interfaces/firestore-backend.interface';
import type { FirestoreProviderOptions } from '../interfaces/firestore-provider-options.interface';
import { buildFirestoreEntityMetadata } from '../repository/firestore-entity-metadata';
import { FirestoreRepository } from '../repository/firestore-repository';
import { FirestoreTransactionFactory } from '../transaction/firestore-transaction.factory';

type FirestoreTransactionFactoryDescriptor = NonNullable<
  DynamicRepositoryModule['transactionFactories']
>[number];

const backendTransactionKeys = new WeakMap<FirestoreBackend, string>();

/**
 * Stable per-backend transaction key. Identity is the backend instance
 * (WeakMap), and the suffix is a UUID assigned once — no process-global
 * counter, no boot-order-dependent numbering.
 */
export function resolveFirestoreTransactionKey(
  backend: FirestoreBackend,
): string {
  const existing = backendTransactionKeys.get(backend);
  if (existing !== undefined) {
    return existing;
  }
  const key = `${FIRESTORE_DEFAULT_TRANSACTION_KEY}:${randomUUID()}`;
  backendTransactionKeys.set(backend, key);
  return key;
}

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
  transactionKey: string = resolveFirestoreTransactionKey(backend),
): Provider {
  assertSupportedUniqueConstraints(options);
  const collection = options.collection ?? options.key;
  const uniqueDocumentIdField =
    options.uniqueDocumentIdField ??
    resolveSingleUniqueField(options.uniqueConstraints);

  return {
    provide: getDynamicRepositoryToken(options.key),
    inject: [HookResolverService],
    useFactory: (hookResolver: HookResolverService) => {
      const metadata = buildFirestoreEntityMetadata(
        options.entity,
        collection,
        options.softDeleteField,
      );
      return new FirestoreRepository(
        {
          entityKey: options.key,
          collection,
          metadata,
          backend,
          transactionKey,
          uniqueDocumentIdField,
        },
        hookResolver,
      );
    },
  };
}

function resolveSingleUniqueField(
  constraints: ReadonlyArray<ReadonlyArray<string>> | undefined,
): string | undefined {
  if (!constraints || constraints.length !== 1) {
    return undefined;
  }
  const first = constraints[0];
  if (first === undefined || first.length !== 1) {
    return undefined;
  }
  return first[0];
}

/**
 * Composite uniqueness needs a secondary index collection (issue #44 P1-3
 * tier 2). Refuse at boot so apps do not silently accept unenforceable
 * constraints.
 */
function assertSupportedUniqueConstraints(
  options: FirestoreProviderOptions,
): void {
  const constraints = options.uniqueConstraints ?? [];
  for (const constraint of constraints) {
    if (constraint.length > 1) {
      throw new Error(
        `Firestore adapter: composite unique constraint [${constraint.join(
          ', ',
        )}] on entity "${options.key}" is not supported yet — use a single ` +
          `uniqueDocumentIdField / natural document id, or wait for the ` +
          `uniqueness-index collection (issue #44 P1-3 tier 2).`,
      );
    }
  }
}

export function createFirestoreTransactionFactoryDescriptor(
  backend: FirestoreBackend,
  transactionKey: string = resolveFirestoreTransactionKey(backend),
): FirestoreTransactionFactoryDescriptor {
  return {
    key: transactionKey,
    inject: [],
    useFactory: () => new FirestoreTransactionFactory(backend),
  };
}

export function createFirestoreFeatureModule(
  entities: FirestoreProviderOptions[],
  backend?: FirestoreBackend,
): DynamicRepositoryModule {
  const resolvedBackend = resolveFirestoreBackend(backend);
  const transactionKey = resolveFirestoreTransactionKey(resolvedBackend);

  return {
    module: FirestoreRepositoryModule,
    providers: [
      { provide: FIRESTORE_BACKEND, useValue: resolvedBackend },
      ...entities.map((entity) =>
        createFirestoreProvider(entity, resolvedBackend, transactionKey),
      ),
    ],
    exports: [
      FIRESTORE_BACKEND,
      ...entities.map((entity) => getDynamicRepositoryToken(entity.key)),
    ],
    transactionFactories: [
      createFirestoreTransactionFactoryDescriptor(
        resolvedBackend,
        transactionKey,
      ),
    ],
  };
}
