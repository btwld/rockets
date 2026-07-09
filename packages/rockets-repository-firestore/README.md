# @bitwild/rockets-repository-firestore

[![NPM](https://img.shields.io/npm/v/@bitwild/rockets-repository-firestore)](https://www.npmjs.com/package/@bitwild/rockets-repository-firestore)
[![NestJS](https://img.shields.io/badge/NestJS-11-ea2845?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

> Firestore adapter for the Rockets dynamic-repository contract. Mix
> Firestore-backed entities with a TypeORM (or any other) default adapter, per
> entity.

**Status:** preview (`1.0.0-alpha.9` on npm, dist-tag `alpha`). API stable
enough to use; expect refinements before 1.0.

---

## 1. Introduction

`@bitwild/rockets-repository-firestore` implements `RepositoryAdapter` and
`DynamicRepositoryModule` from `@concepta/nestjs-repository`, so any Rockets
handler that talks to `RepositoryInterface<T>` will work against Firestore
without code changes.

The package is **per-entity opt-in**, not a wholesale replacement: register it
as the override on a single entity inside
`defineModuleResource({ entities: [{ entity, repository, collection? }] })`.
Other entities continue on the default adapter (TypeORM, in most apps).

### What it gives you

- `FirestoreRepositoryModule.forRoot({ entities, backend? })` — validates
  Firebase Admin (or test backend) and returns a global module; same shape as
  `TypeOrmModule.forRoot({ ...connection, entities })`.
- `FirestoreRepositoryModule.forFeature(entities, options?)` — registers dynamic
  repository providers per entity row.
- `defineFirestoreRepository()` — `RepositoryBootstrap` with the same shape as
  app-local `defineTypeOrmRepository` (thin delegate, no env sniffing).
- `FirestoreRepository<Entity>` — adapter class implementing
  `RepositoryAdapter<Entity>`.
- `ensureFirebaseAdminApp(packageRoot)` — singleton Admin initialisation for
  apps that wire Firebase outside `defineFirebaseAuth`.
- `InMemoryFirestoreBackend` — explicit test double; inject via
  `forFeature(..., { backend })` or `defineFirestoreRepository({ backend })` in
  test harnesses only.

### When to use this package

- You want a single entity (analytics events, large blobs, audit log) on
  Firestore while the rest of the app stays on SQL.
- You want a Firebase-first app with Firebase Auth + Firestore storage.

### When NOT to use this package

- You need ACID transactions across multiple entities — stay on a SQL adapter
  for cross-entity transactional flows.
- You only want SQL — install `@bitwild/rockets-repository-typeorm` instead.

---

## 2. Get Started

### Install

```bash
yarn add @bitwild/rockets-repository-firestore@alpha @bitwild/rockets-core@alpha \
  firebase-admin
```

### Initialise Firebase Admin in the app (required)

Production apps must initialise Firebase Admin **once**, centrally — the same
way TypeORM connection options live in `defineTypeOrmRepository`:

- via `defineFirebaseAuth({ forRootAsync: ... })` (recommended when using
  Firebase Auth), or
- via `ensureFirebaseAdminApp(packageRoot)` before Rockets boots.

The repository package does **not** read credentials, flip env flags, or fall
back to an in-memory store.

Credential paths (`FIREBASE_SERVICE_ACCOUNT_PATH`,
`GOOGLE_APPLICATION_CREDENTIALS`, `FIREBASE_PROJECT_ID`) are resolved by
`ensureFirebaseAdminApp` when the **app** calls it — not inside
`defineFirestoreRepository`.

### Use one entity on Firestore

```typescript
import { defineModuleResource } from '@bitwild/rockets-core';
import { defineFirestoreRepository } from '@bitwild/rockets-repository-firestore';

import { AnalyticsEventEntity } from './analytics-event.entity';

const firestoreRepository = defineFirestoreRepository();

export const analyticsFeature = defineModuleResource({
  entities: [
    {
      entity: AnalyticsEventEntity,
      repository: firestoreRepository,
      collection: 'analytics_events',
    },
  ],
  providers: [
    /* services that inject the dynamic repository */
  ],
});
```

The rest of `RocketsCoreModule.forRoot({ repository: <default> })` keeps using
its default SQL adapter. Core calls `forRoot` / `forFeature` on each bootstrap
adapter in the registration plan.

### Bootstrap: `forRoot` vs `forFeature`

Same **API shape** as `defineTypeOrmRepository`, different behaviour:

| Call                                  | Firestore behaviour                                                                                                                                                                                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`forRoot({ entities, backend? })`** | Validates Firebase Admin is ready (or uses test `backend`). Returns a global module shell. The `entities` list mirrors the Rockets planner contract — Firestore does not register metadata on entities here (unlike TypeORM connection metadata). |
| **`forFeature(entities, options?)`**  | Creates `@InjectDynamicRepository` providers for each entity row. This is where repositories actually materialise.                                                                                                                                |

Rockets core always invokes **both** once per `RepositoryBootstrap` in the plan.
Do not skip `forFeature` or register repos only in `forRoot`.

---

## 3. How-to Guides

### Override the collection id

The default collection id equals the entity key (derived from the entity class
name). Set `collection` on the entity registration row:

```typescript
defineModuleResource({
  entities: [
    {
      entity: CodeReviewReportEntity,
      repository: firestoreRepository,
      collection: 'code_review_reports',
    },
  ],
});
```

### Tests

Do not use environment flags. Inject the in-memory backend explicitly:

```typescript
import {
  defineFirestoreRepository,
  InMemoryFirestoreBackend,
} from '@bitwild/rockets-repository-firestore';

const testRepository = defineFirestoreRepository({
  backend: new InMemoryFirestoreBackend(),
});
```

Or call the module factory directly in unit tests:

```ts
FirestoreRepositoryModule.forFeature(entities, {
  backend: new InMemoryFirestoreBackend(),
});
```

### Soft delete

The soft-delete column is **auto-detected only** — the adapter checks the
entity instance for a `dateRemoved` or `deletedAt` property
(`FIRESTORE_DEFAULT_SOFT_DELETE_FIELD` / `FIRESTORE_ALT_SOFT_DELETE_FIELD`).
`ModuleResourceEntityEntry` (the shape accepted by
`defineModuleResource({ entities: [...] })`) has no `softDeleteField`
override — name the column `dateRemoved` or `deletedAt` on the entity class.
If neither name is present, `delete()` calls throw at runtime with a message
naming both supported column names.

---

## 4. Reference

### Module

| Member                                                      | Purpose                                                                                                                                                                              |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `FirestoreRepositoryModule.forRoot({ entities, backend? })` | Global bootstrap — validates Firebase Admin in production (or accepts `{ backend }` in tests). Receives the planner-derived entity list, like `TypeOrmModule.forRoot({ entities })`. |
| `FirestoreRepositoryModule.forFeature(entities, options?)`  | Returns a `DynamicRepositoryModule` with `@InjectDynamicRepository` providers. Production omits `options`; tests may pass `{ backend: InMemoryFirestoreBackend }`.                   |
| `defineFirestoreRepository(options?)`                       | Returns a `RepositoryBootstrap` — delegates to `FirestoreRepositoryModule.forRoot` / `forFeature`, same contract as `defineTypeOrmRepository`.                                       |

### Helpers

| Symbol                                | Purpose                                               |
| ------------------------------------- | ----------------------------------------------------- |
| `ensureFirebaseAdminApp(packageRoot)` | App-level Admin singleton (call from auth bootstrap). |
| `InMemoryFirestoreBackend`            | Explicit test double — not selected by env vars.      |

---

## License

BSD-3-Clause
