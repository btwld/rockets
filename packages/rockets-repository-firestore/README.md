# @concepta/rockets-repository-firestore

<!-- docs-check: no-boot — the example calls ensureFirebaseAdminApp(), which
     needs a service account file or FIREBASE_PROJECT_ID, and neither is set
     in CI. Nothing else boots this example: the package's emulator suite
     covers the adapter, not these snippets. -->

[![NPM](https://img.shields.io/npm/v/@concepta/rockets-repository-firestore)](https://www.npmjs.com/package/@concepta/rockets-repository-firestore)
[![NestJS](https://img.shields.io/badge/NestJS-12-ea2845?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

> Firestore adapter for the Rockets dynamic-repository contract. Mix
> Firestore-backed entities with a TypeORM (or any other) default adapter, per
> entity.

**Status:** pre-1.0 preview, published on the `alpha` dist-tag at
`0.1.0-alpha.3`. Pin the exact version in an application you deploy:
breaking changes land between alphas,
and the tag moves. Public shapes may still change before 1.0.

---

## 1. Introduction

`@concepta/rockets-repository-firestore` implements `RepositoryAdapter` and
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
  `defineTypeOrmRepository` from `@concepta/rockets-repository-typeorm`.
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

- You need SQL-style relational joins or multi-field unique constraints that
  cannot map to a document id / uniqueness-index collection — see issue #44
  "Honest limits".
- You only want SQL — install `@concepta/rockets-repository-typeorm` instead.

### Transactions

Prefer `FirestoreRepository.transaction(async () => { … })` (or
`runInFirestoreTransaction(backend, …)` / inject `FIRESTORE_BACKEND`) for
contended read-modify-write (rate limits, leases, turn locks, idempotent
enqueue). The body runs **inside** the SDK callback, so a contention retry
re-executes it. Repository calls made during the callback automatically join
the ambient transaction — no `{ ctx }` plumbing required.

`TransactionScope.run(ctx, …)` with `{ ctx }` / `transactional: true` still
works for uncontended multi-write units, but the imperative bridge **refuses**
a Firestore retry (throws `FIRESTORE_TRANSACTION_RETRY_UNSUPPORTED`) instead of
committing an empty write set. The bridge logs a one-time warning on first use.
Do not use it for hot paths that expect retries.

Firestore limits a single transaction to **500 writes** and refuses the
501st write with `FIRESTORE_TRANSACTION_WRITE_LIMIT_EXCEEDED`. Inside a
transaction there is no `count()` aggregation — `count` / `findAndCount`
read every matching document and hold locks on it, so avoid unbounded counts
in a transactional path.

On a **soft-deletable** entity, `create` and `upsert` (and `replace` when the
caller omits the soft-delete field) read the document before writing so a
deleted row is not resurrected. Firestore requires all reads before all
writes inside a transaction — call those ops before any write in the same
unit, or the adapter throws `FIRESTORE_TRANSACTION_READ_AFTER_WRITE`.

Outside a transaction, soft-deletable `upsert` is still two round trips
(read then set). A concurrent soft-delete between them can resurrect the
row; wrap contended upserts in `repo.transaction()` / `runInFirestoreTransaction`
when that race matters.

Nesting `runInFirestoreTransaction` (or `repo.transaction()`) on the same
backend joins the ambient transaction; nesting across two different backends
throws `FIRESTORE_TRANSACTION_BACKEND_MISMATCH`, since a transaction cannot
span databases. A repository bound to another backend does not join the
ambient handle — its writes go through its own backend, outside that
transaction.

`createMany` / `deleteMany` use atomic `WriteBatch` (≤500 ops per batch)
outside transactions; inside a transaction they stay sequential on the ambient
handle. Soft-delete exclusion is pushed server-side as `dateRemoved == null`
(P1-4). Use `firestoreIncrement(delta)` / `repo.increment(...)` for counters
without a full RMW transaction — `increment` writes only the counter field,
returns `void`, and defaults to `exists: true` (missing documents fail with
`FirestorePreconditionFailedException`). Pass `{ precondition: undefined }`
to opt out of the exists check. Use `updateWithPrecondition(...)` for
exists-guarded / `lastUpdateTime` updates (document `updateTime` is not yet
exposed on entity reads — `lastUpdateTime` CAS requires a time you already
hold). Inequality queries promote every inequality field ahead of the
requested `orderBy` when the leading set does not already contain them
(any order among inequalities keeps `limit()` pushdown, but each order
needs its own composite index). When promotion changes the leading set,
`limit()` is **not** pushed and the matching set is read then sorted
client-side (cost scales with matches, not the page size).

`update` without a precondition uses `set({ merge: true })` (nested maps
deep-merge). `updateWithPrecondition` uses Admin `update()` (map-valued
fields are replaced wholesale; dotted keys are field paths).

Tier-1 uniqueness: set `uniqueDocumentIdField` (or a single-column
`uniqueConstraints` entry) on the `forFeature` / entity registration row —
composite unique refuses at boot. Zod / `db.unique` schema metadata is not
auto-wired yet; `f.string({ unique: true })` alone does nothing.

`createMany` chunks larger than 500 are **not** atomic across chunks.

Legacy docs that omit the soft-delete field need a one-time
`backfillSoftDeleteNull` or `adminStreamBackfillSoftDeleteNull` before they
appear in default lists.

Default lists that combine soft-delete with other filters / `orderBy` need
**composite indexes**. The emulator does not validate indexes — production
returns `FAILED_PRECONDITION` without them. Copy
[`firestore.indexes.example.json`](./firestore.indexes.example.json) into your
app's `firestore.indexes.json` and replace collection / field paths.

---

## 2. Get Started

### Install

```bash
yarn add @concepta/rockets-repository-firestore@alpha @concepta/rockets-core@alpha \
  @concepta/rockets-repository-typeorm@alpha typeorm @nestjs/typeorm sqlite3 \
  @nestjs/common @nestjs/core firebase-admin reflect-metadata rxjs
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

### Minimal working example — one entity on Firestore

```typescript
// src/analytics/analytics-event.entity.ts
/**
 * Firestore documents are plain classes — no TypeORM decorators. The class
 * is the dynamic-repository key and the row shape.
 */
export class AnalyticsEventEntity {
  id!: string;
  name!: string;
  userId!: string;
  dateCreated!: Date;
}
```

```typescript
// src/analytics/analytics.feature.ts
import { defineModuleResource } from '@concepta/rockets-core';
import { defineFirestoreRepository } from '@concepta/rockets-repository-firestore';
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
});
```

Wire the bundle into an app. The root `repository` stays SQL; only this
entity lives in Firestore:

```typescript
// src/app.module.ts
import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { RocketsCoreModule } from '@concepta/rockets-core';
import { defineTypeOrmRepository } from '@concepta/rockets-repository-typeorm';
import { ensureFirebaseAdminApp } from '@concepta/rockets-repository-firestore';
import { analyticsFeature } from './analytics/analytics.feature';

// REQUIRED, and before the module is built: the adapter reads the Admin
// singleton, it never initialises one. Resolves a service account file under
// the package root, or FIREBASE_PROJECT_ID for the emulator.
ensureFirebaseAdminApp(join(__dirname, '..'));

@Module({
  imports: [
    RocketsCoreModule.forRoot({
      repository: defineTypeOrmRepository({
        type: 'sqlite',
        database: ':memory:',
        synchronize: true,
      }),
      resources: [analyticsFeature],
    }),
  ],
})
export class AppModule {}
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
} from '@concepta/rockets-repository-firestore';

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

The adapter materializes an explicit `null` for that field so default lists can
use a server-side `== null` filter (and keep `limit` / `count` on Firestore):
on `create`, on an `upsert` that lands on a **new** document, and on `replace`
when the document is missing or legacy (no field yet). `replace` carries the
soft-delete value from the loaded entity when present; if the entity is
hand-built (`{ id }` only) or the DTO passes `dateRemoved: undefined`,
`replace` reads the live document and preserves a soft-deleted marker instead
of inventing `null`. `update` and `upsert` over an **existing** document never
invent it — under `merge: true` that would resurrect soft-deleted documents.

Documents written outside the adapter without the field will not appear in
default lists until backfilled:

```ts
import {
  backfillSoftDeleteNull,
  InMemoryFirestoreBackend, // or inject FIRESTORE_BACKEND
} from '@concepta/rockets-repository-firestore';

await backfillSoftDeleteNull({
  backend,
  collection: 'widgets',
  softDeleteField: 'dateRemoved',
});
```

For large production collections, stream with the Admin SDK instead of the
helper (which loads the collection via `queryBranch`):

```ts
import { getFirestore } from 'firebase-admin/firestore';

const db = getFirestore();
const writer = db.bulkWriter();
for await (const doc of db.collection('widgets').stream()) {
  if (!Object.prototype.hasOwnProperty.call(doc.data(), 'dateRemoved')) {
    writer.set(doc.ref, { dateRemoved: null }, { merge: true });
  }
}
await writer.close();
```

### Composite indexes (required in production)

Any query that applies soft-delete exclusion **and** another equality /
`orderBy` needs a composite index. Example shape (see
`firestore.indexes.example.json`):

```json
{
  "collectionGroup": "widgets",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "dateRemoved", "order": "ASCENDING" },
    { "fieldPath": "userId", "order": "ASCENDING" },
    { "fieldPath": "dateCreated", "order": "DESCENDING" }
  ]
}
```

Deploy with `firebase deploy --only firestore:indexes`. The emulator suite
stays green without indexes; production fails with `FAILED_PRECONDITION`.

### Local query parity

The in-memory backend and Admin SDK direct-document/post-filter paths match
Firestore for missing versus explicit `null`, nested field paths, structural
equality, and scalar range filters that compare only values sharing the query
bound's type. `between` is a client-side Rockets operator and intentionally
requires its value and bounds to share one scalar type. Local `orderBy` uses
Firestore's deterministic type order and supports every Firestore value type,
including `NaN`, bytes, references, geographical points, arrays, vectors, and
maps.

Document-id `IN` queries accept at most 500 ids and use one Admin SDK `getAll`
request. The direct-document path fetches all requested ids before applying
`skip` and `take`, so a page limit does not reduce document reads.

`createMany` / `deleteMany` commit through `WriteBatch` (atomic per ≤500-op
chunk). Chunks larger than 500 are committed sequentially — a later chunk
failure leaves earlier chunks applied.

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
| `FIRESTORE_BACKEND`                   | DI token for the shared backend from `forFeature`.    |
| `backfillSoftDeleteNull(...)`         | Patch legacy docs missing the soft-delete field.      |
| `InMemoryFirestoreBackend`            | Explicit test double — not selected by env vars.      |

---

## Working examples

| Example                                                                                      | Shows                                                                 |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| [`examples/sample-code-review`](https://github.com/btwld/rockets/tree/main/examples/sample-code-review/apps/api)                   | Firestore next to SQL: reports on Firestore, the rest on TypeORM.     |

The package's own suites cover CRUD, soft delete, transactions and the
emulator setup (`yarn test:firestore-emulator`).

---

## License

BSD-3-Clause
