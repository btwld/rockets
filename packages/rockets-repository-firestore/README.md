# @bitwild/rockets-repository-firestore

[![NPM](https://img.shields.io/npm/v/@bitwild/rockets-repository-firestore)](https://www.npmjs.com/package/@bitwild/rockets-repository-firestore)
[![NestJS](https://img.shields.io/badge/NestJS-11-ea2845?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

> Firestore adapter for the Rockets dynamic-repository contract. Mix Firestore-backed entities with a TypeORM (or any other) default adapter, per entity.

**Status:** preview (`1.0.0-alpha.0`). API stable enough to use, but expect refinements before 1.0.

---

## 1. Introduction

`@bitwild/rockets-repository-firestore` implements `RepositoryAdapter` and `DynamicRepositoryModule` from `@concepta/nestjs-repository`, so any Rockets handler that talks to `RepositoryInterface<T>` will work against Firestore without code changes.

The package is **per-entity opt-in**, not a wholesale replacement: register it as the override on a single entity inside `defineModuleResource({ entities: [{ entity, repository: FirestoreRepositoryModule }] })`. Other entities continue on the default adapter (TypeORM, in most apps).

### What it gives you

- `FirestoreRepositoryModule.forFeature(entities)` — Nest dynamic module that materialises Firestore-backed repositories for the entities passed in.
- `FirestoreRepository<Entity>` — adapter class implementing `RepositoryAdapter<Entity>` (find, create, update, delete, soft-delete, restore).
- Two backends: real Firestore (`firebase-admin`) and an in-memory backend for tests / local dev (`FIREBASE_FIRESTORE_USE_FAKE=true`).
- `registerFirestoreCollection(key, collection)` — map an entity key to a Firestore collection id (defaults to the entity key).
- `ensureFirebaseAdminApp(packageRoot)` — singleton Admin app initialisation, shared with the Firebase auth adapter.
- Soft-delete support: auto-detects `dateRemoved` / `deletedAt` columns; configurable via `softDeleteField`.

### When to use this package

- You want a single entity (analytics events, large blobs, audit log) on Firestore while the rest of the app stays on SQL.
- You want a Firebase-first app with Firebase Auth + Firestore storage.

### When NOT to use this package

- You need ACID transactions across multiple entities — Firestore transactions are limited, and this adapter does not implement the upstream `TransactionScope` API end-to-end. Stay on a SQL adapter for cross-entity transactional flows.
- You only want SQL — install `@concepta/nestjs-repository-typeorm` instead.

---

## 2. Get Started

### Install

```bash
yarn add @bitwild/rockets-repository-firestore @bitwild/rockets-repository \
  firebase-admin
```

`firebase-admin` is an optional peer dependency — only required when `FIREBASE_FIRESTORE_USE_FAKE` is unset.

### Configure credentials

The adapter loads a service account from one of these env vars (first match wins):

- `FIREBASE_SERVICE_ACCOUNT_PATH` — relative or absolute path to a service-account JSON.
- `GOOGLE_APPLICATION_CREDENTIALS` — Google's standard path env.
- `FIREBASE_PROJECT_ID` — falls back to project-id-only init (use only in environments where Google ADC fills in the credentials).

For local dev without credentials, set `FIREBASE_FIRESTORE_USE_FAKE=true` to switch to the in-memory backend.

### Use one entity on Firestore

```typescript
import { defineModuleResource } from '@bitwild/rockets-core';
import { FirestoreRepositoryModule } from '@bitwild/rockets-repository-firestore';

import { AnalyticsEventEntity } from './analytics-event.entity';

export const analyticsFeature = defineModuleResource({
  entities: [
    { entity: AnalyticsEventEntity, repository: FirestoreRepositoryModule },
  ],
  providers: [/* services that inject the dynamic repository */],
});
```

The rest of `RocketsCoreModule.forRoot({ repository: <default> })` keeps using its default adapter for everything else.

---

## 3. How-to Guides

### Override the collection id

The default collection id equals the entity key (derived from the entity class name). To rename, register the mapping before the module bootstraps.

```typescript
import { deriveEntityKey } from '@bitwild/rockets-common';
import { registerFirestoreCollection } from '@bitwild/rockets-repository-firestore';

import { CodeReviewReportEntity } from './code-review-report.entity';

registerFirestoreCollection(
  deriveEntityKey(CodeReviewReportEntity), // 'codeReviewReport'
  'code_review_reports',                   // actual Firestore collection id
);
```

Place the call in a module-level `register-*.ts` file imported once by the feature.

### Run without a service account in local dev

```bash
FIREBASE_FIRESTORE_USE_FAKE=true yarn workspace your-app start:dev
```

The in-memory backend implements the same `FirestoreBackend` interface, so query behaviour matches real Firestore for the operators the adapter translates. Use this for unit / e2e tests and for first-run dev without provisioning a Firebase project.

### Configure soft delete

The adapter auto-detects a `dateRemoved` or `deletedAt` column. To use a different column name, pass `softDeleteField`:

```typescript
{
  entity: AuditLogEntity,
  repository: FirestoreRepositoryModule,
  softDeleteField: 'removedAt',
}
```

### Share the Admin app with Firebase Auth

If the app also uses `@bitwild/rockets-adapter-firebase`, call `ensureFirebaseAdminApp(packageRoot)` once in your bootstrap so both packages share the same Admin instance. Without sharing, you risk `firebase-admin` initialising twice and throwing.

```typescript
import { ensureFirebaseAdminApp } from '@bitwild/rockets-repository-firestore';

ensureFirebaseAdminApp(__dirname);
```

---

## 4. Reference

### Module

| Member | Purpose |
|---|---|
| `FirestoreRepositoryModule.forFeature(entities)` | Returns a `DynamicRepositoryModule` exposing dynamic repositories for the entities passed in. Pass each entry as `{ entity, collection?, softDeleteField? }`. |

The module does **not** have `forRoot()`. It is wired as a per-entity adapter override, not as the app's default `repository:` field.

### Adapter class

| Member | Purpose |
|---|---|
| `FirestoreRepository<Entity>` | Extends `RepositoryAdapter<Entity>` from `@concepta/nestjs-repository`. Implements find / count / create / update / upsert / delete / restore (soft-delete supported). |
| `isFirestoreRepository(value)` | Type guard for plug-in code that needs to special-case Firestore-backed repositories. |

### Configuration types

| Type | Purpose |
|---|---|
| `FirestoreProviderOptions<Entity>` | Per-entity entry shape: `{ entity, collection?, softDeleteField? }`. |
| `FIRESTORE_DEFAULT_SOFT_DELETE_FIELD` | `'dateRemoved'`. |
| `FIRESTORE_ALT_SOFT_DELETE_FIELD` | `'deletedAt'`. |
| `FIRESTORE_REPOSITORY_MODULE_NAME` | The module name set on the dynamic module returned by `forFeature`. |

### Helpers

| Symbol | Purpose |
|---|---|
| `registerFirestoreCollection(key, collection)` | Map an entity key to a Firestore collection id. Call at module-load time. |
| `resolveFirestoreCollection(key)` | Reverse lookup, returns `undefined` if not registered. |
| `ensureFirebaseAdminApp(packageRoot)` | Singleton Admin app initialiser. Reads `FIREBASE_SERVICE_ACCOUNT_PATH` / `GOOGLE_APPLICATION_CREDENTIALS` / `FIREBASE_PROJECT_ID`. |

### Environment variables

| Var | Purpose |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT_PATH` | Absolute or relative path to a service-account JSON. |
| `GOOGLE_APPLICATION_CREDENTIALS` | Standard Google ADC path. |
| `FIREBASE_PROJECT_ID` | Project id when ADC is set externally. |
| `FIREBASE_FIRESTORE_USE_FAKE` | `'true'` switches every repository to the in-memory backend. |

---

## License

BSD-3-Clause
