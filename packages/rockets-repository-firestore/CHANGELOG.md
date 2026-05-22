# Changelog

## Unreleased

### Added

- `findPage` implements `PageableRepositoryInterface` from `@bitwild/rockets-repository` (opaque `nextCursor.token`, Firestore `startAfter` under the hood).
- Full `WhereOperator` coverage (EQ, NE, comparisons, IN, NIN, null checks, string matchers, BETWEEN) with Firestore-native or post-filter execution.
- OR support via `RepositoryAdapter.toDnf()`.
- `skip` / `take` pagination.
- Efficient `count` / `findAndCount` (aggregation when possible).
- Soft delete / restore when `dateRemoved` or `deletedAt` is configured on the entity (or via `softDeleteField` option).
- `withDeleted` on find options.
- Exported `ensureFirebaseAdminApp()` for shared Admin bootstrap with auth.

### Changed

- Backend API: `query()` replaced by `queryBranch()` / `countBranch()` with structured query plans.
- README documents supported features and Firestore platform limits.
