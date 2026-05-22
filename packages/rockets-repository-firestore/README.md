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

## Cursor pagination (`findPage`)

Pagination types live in **`@bitwild/rockets-repository`** (`RepositoryPageQuery`,
`PageableRepositoryInterface`). This adapter implements that contract with Firestore
`startAfter`; TypeORM or other adapters can implement the same interface differently.

```typescript
import {
  isPageableRepository,
  type RepositoryPageCursor,
} from '@bitwild/rockets-repository';

let after: RepositoryPageCursor | null = null;

if (!isPageableRepository(reports)) {
  throw new Error('Repository adapter does not support findPage');
}

do {
  const page = await reports.findPage({
    where: Where.eq('userId', userId),
    order: [{ field: 'dateCreated', order: SortOrder.DESC }],
    pageSize: 20,
    after,
  });
  after = page.nextCursor;
  // page.items ...
} while (after);
```

Requires a single AND branch (no OR), no post-filters on the query, and `pageSize > 0`.
The same `order` must be passed on every page (validated against the cursor).
Sort fields need a matching composite index when combined with `where`.

## Limitations (Firestore platform)

- No cross-collection joins.
- `skip` on large collections is expensive (no SQL OFFSET); prefer `findPage` + `afterCursor`.
- `nin` and some string matchers run as post-filters after the Firestore query.
