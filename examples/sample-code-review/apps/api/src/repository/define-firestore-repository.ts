import { existsSync } from 'fs';
import { isAbsolute, resolve } from 'path';
import type { DynamicModule, PlainLiteralObject, Type } from '@nestjs/common';
import { Global, Logger, Module } from '@nestjs/common';
import { deriveEntityKey } from '@bitwild/rockets-common';
import type { RepositoryBootstrap } from '@bitwild/rockets-core';
import type {
  DynamicRepositoryModule,
  RepositoryProviderOptions,
} from '@concepta/nestjs-repository';
import {
  FirestoreRepositoryModule,
  registerFirestoreCollection,
  resolveFirestoreCollection,
} from '@bitwild/rockets-repository-firestore';

import { createFirebaseAdminApp } from '../auth-firebase/create-firebase-admin-app';

const logger = new Logger('FirestoreRepositoryBootstrap');

export interface FirestoreEntityPersistenceConfig {
  readonly entity: Type<PlainLiteralObject>;
  /** Firestore collection id. Defaults to `deriveEntityKey(entity)`. */
  readonly collection?: string;
}

export interface DefineFirestoreRepositoryConfig {
  /**
   * App package root — used to resolve relative credential paths.
   * Defaults to `apps/api` when omitted (two levels up from `src/repository`).
   */
  readonly packageRoot?: string;
  /**
   * Optional collection id per entity (applied in `forFeature` / `forRoot`).
   * Entities omitted here use the entity key as the collection name.
   */
  readonly entities?: ReadonlyArray<FirestoreEntityPersistenceConfig>;
  readonly defaultServiceAccountPath?: string;
}

function resolvePackageRoot(configured?: string): string {
  return configured ?? resolve(__dirname, '..', '..');
}

function resolveServiceAccountAbsolutePath(
  packageRoot: string,
  defaultRelativePath: string,
): string | undefined {
  const configured =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim() ?? defaultRelativePath;
  const absolute = resolve(packageRoot, configured.replace(/^\.\//, ''));
  return existsSync(absolute) ? absolute : undefined;
}

function hasGoogleApplicationCredentials(packageRoot: string): boolean {
  const configured = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (!configured) {
    return false;
  }
  const absolute = isAbsolute(configured)
    ? configured
    : resolve(packageRoot, configured.replace(/^\.\//, ''));
  return existsSync(absolute);
}

function ensureFirestoreBackend(
  packageRoot: string,
  defaultServiceAccountPath: string,
): void {
  if (
    process.env.FIREBASE_FIRESTORE_USE_FAKE !== 'true' &&
    !resolveServiceAccountAbsolutePath(packageRoot, defaultServiceAccountPath) &&
    !hasGoogleApplicationCredentials(packageRoot)
  ) {
    process.env.FIREBASE_FIRESTORE_USE_FAKE = 'true';
    logger.warn(
      'No Firebase service account — Firestore uses in-memory backend. ' +
        'Add apps/api/secrets/firebase-service-account.json (and set ' +
        'FIREBASE_SERVICE_ACCOUNT_PATH) for real Firestore.',
    );
  }

  if (process.env.FIREBASE_FIRESTORE_USE_FAKE !== 'true') {
    createFirebaseAdminApp();
  }
}

function registerCollection(
  entity: Type<PlainLiteralObject>,
  collection?: string,
): string {
  const key = deriveEntityKey(entity);
  const resolved = collection?.trim() ?? resolveFirestoreCollection(key) ?? key;
  registerFirestoreCollection(key, resolved);
  return resolved;
}

@Global()
@Module({})
class FirestoreRepositoryRootModule {}

/**
 * Same contract as `defineTypeOrmRepository`: returns a `RepositoryBootstrap`
 * Rockets calls `forRoot` (root adapter only) and `forFeature` (per adapter group).
 */
export function defineFirestoreRepository(
  config: DefineFirestoreRepositoryConfig = {},
): RepositoryBootstrap {
  const packageRoot = resolvePackageRoot(config.packageRoot);
  const defaultServiceAccountPath =
    config.defaultServiceAccountPath ?? './secrets/firebase-service-account.json';

  const collectionByEntity = new Map<Type<PlainLiteralObject>, string | undefined>(
    (config.entities ?? []).map((row) => [row.entity, row.collection]),
  );

  const ensureBackend = (): void => {
    ensureFirestoreBackend(packageRoot, defaultServiceAccountPath);
  };

  const registerEntities = (
    entities: ReadonlyArray<Type<PlainLiteralObject>>,
  ): void => {
    for (const entity of entities) {
      registerCollection(entity, collectionByEntity.get(entity));
    }
  };

  const registerFeatureRows = (
    entities: RepositoryProviderOptions[],
  ): void => {
    for (const row of entities) {
      registerCollection(row.entity, collectionByEntity.get(row.entity));
    }
  };

  return {
    name: 'firestore-bootstrap',

    forFeature(
      entities: RepositoryProviderOptions[],
    ): DynamicRepositoryModule {
      ensureBackend();
      registerFeatureRows(entities);
      return FirestoreRepositoryModule.forFeature(entities);
    },

    forRoot(
      entities: ReadonlyArray<Type<PlainLiteralObject>>,
    ): DynamicModule {
      ensureBackend();
      registerEntities(entities);
      return { module: FirestoreRepositoryRootModule, global: true };
    },
  };
}
