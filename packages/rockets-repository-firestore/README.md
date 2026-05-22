# `@bitwild/rockets-repository-firestore`

Official Firestore repository adapter for Rockets dynamic repositories — same
registration model as `@concepta/nestjs-repository-typeorm`.

## Usage

Register the default adapter as TypeORM and override one entity to Firestore:

```typescript
import { FirestoreRepositoryModule } from '@bitwild/rockets-repository-firestore';
import { defineModuleResource } from '@bitwild/rockets-core';

defineModuleResource({
  entities: [
    {
      entity: CodeReviewReportEntity,
      repository: FirestoreRepositoryModule,
    },
  ],
  providers: [AnalysisService],
});
```

Bootstrap Firebase Admin once (shared with `@bitwild/rockets-adapter-firebase`):

```typescript
import { ensureFirebaseAdminApp } from '@bitwild/rockets-repository-firestore';

ensureFirebaseAdminApp(process.cwd());
```

Inject in services:

```typescript
constructor(
  @InjectDynamicRepository(CodeReviewReportEntity)
  private readonly reports: RepositoryInterface<CodeReviewReportEntity>,
) {}
```

Register collection names (optional — defaults to entity key):

```typescript
import { registerFirestoreCollection } from '@bitwild/rockets-repository-firestore';

registerFirestoreCollection('CodeReviewReportEntity', 'code_review_reports');
```

## Environment

| Variable | Purpose |
|----------|---------|
| `FIREBASE_FIRESTORE_USE_FAKE=true` | In-memory backend (e2e / local without GCP) |
| `FIREBASE_PROJECT_ID` | Admin SDK when no service account JSON |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | Path to service account JSON |
| `GOOGLE_APPLICATION_CREDENTIALS` | Alternate path to JSON |

## Supported repository features

| Feature | Support |
|---------|---------|
| `find` / `findOne` / `count` / `findAndCount` | Yes |
| `create` / `update` / `upsert` / `replace` / `delete` | Yes |
| `softDelete` / `restore` | Yes when entity has `dateRemoved` or `deletedAt` |
| `withDeleted` on finds | Yes (with soft-delete column) |
| `skip` / `take` | Yes (offset via slice; prefer narrow `where`) |
| `order` | Yes (single-field; in-memory when OR branches merge) |
| `where` AND / OR | OR via DNF (`RepositoryAdapter.toDnf`) |
| `Where.eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `in`, `nin` | Yes (`in` max 30 values) |
| `Where.isNull`, `notNull`, `contains`, `starts`, `ends`, `between` | Yes (native or post-filter) |
| `Where.starts` on strings | Prefix range on Firestore |
| Joins / relations | No — denormalize in documents |
| SQL `LIKE '%x%'` | No — use `contains` post-filter or external search |
| Multi-field range (`gt A` + `lt B` on different fields) | No — Firestore index rule |

## Soft delete

Add `dateRemoved: Date | null` (or `deletedAt`) on the entity class. The adapter
sets an ISO timestamp on `softDelete()` and clears it on `restore()`. Default
queries exclude rows where the field is set.

## Firestore indexes

Composite queries (`where` + `orderBy` on different fields, multiple inequalities)
require composite indexes in the Firebase console. The emulator logs a creation
link when a query is missing an index.

## Pagination

The adapter honours the standard `RepositoryInterface` contract — `find({ skip, take, order, where })`
plus `findAndCount` / `count`. No cursor type is exposed; CRUD modules and any
other consumer of `RepositoryInterface` work identically against TypeORM and Firestore.

Reads are O(skip + take): the adapter pushes `orderBy` + `limit(skip + take)` to the
Firestore Admin SDK and slices `[skip, skip + take]` locally. For typical CRUD pages
(1–10), cost is negligible; deep pagination (page 500+) scales linearly with the
offset, which is the inherent cost of emulating SQL `OFFSET` on Firestore.

```typescript
const reports = repo.find({
  where: Where.eq('userId', userId),
  order: [{ field: 'dateCreated', order: SortOrder.DESC }],
  skip: 40,
  take: 20,
});
```

Sort fields combined with `where` may require a composite index — the Admin SDK
logs a creation link when one is missing.

## Limitations (Firestore platform)

- No cross-collection joins.
- Deep `skip` costs O(skip + take) reads (no native OFFSET).
- `nin` and some string matchers run as post-filters after the Firestore query.
