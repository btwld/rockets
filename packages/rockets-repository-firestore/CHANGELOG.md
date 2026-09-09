# Changelog

## Unreleased

### Breaking — data migration required

- **Soft-delete exclusion moved server-side (issue #44 P1-4).** Default
  `find` / `count` now send `softDeleteField == null` to Firestore instead of
  filtering in memory, which restores `limit()` and the `count()`
  aggregation for every soft-deletable entity. Two consequences:
  - **Existing documents that do not carry the field become invisible** to
    default lists (Firestore equality never matches a missing field). Run
    `backfillSoftDeleteNull` (or the Admin `stream()` + `BulkWriter` recipe in
    the README) **before** deploying this version.
  - Lists that combine soft delete with another predicate or `orderBy` now
    need a **composite index**; without it Firestore returns
    `FAILED_PRECONDITION`. See `firestore.indexes.example.json`. The emulator
    does not validate indexes, so a green suite does not prove this.

  The adapter writes the marker on `create`, on `upsert` that lands on a new
  document, and on `replace` when the document is missing / legacy. `replace`
  preserves deletion when the loaded entity (or a live read for hand-built
  entities / `dateRemoved: undefined`) carries the marker. `update` and
  `upsert` over an existing document never invent it, so soft-deleted rows
  are not resurrected.

### Added

- **Transactions (issue #44 P1-1).** `FirestoreBackend.runTransaction` for
  callback-shaped atomic units; `runInFirestoreTransaction` /
  `FirestoreRepository.transaction` keep the body inside the SDK callback
  (retries re-execute); `FIRESTORE_BACKEND` is exported from `forFeature`;
  `transactionFactories` registered so `TransactionScope` /
  `transactional: true` is supported (imperative bridge refuses retries and
  logs a one-time warning); every `do*` method threads ambient /
  `options.ctx` into the transaction. Transactional `create` maps duplicate
  ids to `FirestoreDuplicateIdException`; transactional queries push
  `limit()`. Nested `runInFirestoreTransaction` joins the ambient handle on
  the same backend and throws `FIRESTORE_TRANSACTION_BACKEND_MISMATCH`
  across backends; the ambient handle is bound to its backend.
- **Atomic increment / precondition (P1-2).** `firestoreIncrement(delta)`
  sentinel + optional `FirestoreWritePrecondition` on `set`/`delete`;
  `FirestoreRepository.increment(...)` writes only the counter field
  (defaults to `exists: true`, returns `void`; pass
  `{ precondition: undefined }` to opt out). `updateWithPrecondition`
  exposes CAS without casting. Public typed exceptions:
  `FirestoreInvalidPreconditionException`,
  `FirestoreInvalidDocumentIdException`,
  `FirestoreBatchWriteLimitExceededException`.
- **Deterministic document ids (P1-3 tier 1).** Manual opt-in via
  `uniqueDocumentIdField` or single-column `uniqueConstraints` on
  `forFeature` registration (composite unique refuses at boot). Document ids
  are validated against Firestore rules (UTF-8 byte length, `.` / `..`,
  `__*__`, `/`). Zod / `db.unique` schema metadata is **not** auto-wired yet
  — `f.string({ unique: true })` is ignored until a follow-up wires schema →
  provider options.
- **Inequality orderBy reconcile (P1-5).** Every inequality field is
  promoted ahead of the caller's `orderBy` when the leading set does not
  already contain them (any order among inequalities keeps `limit()`
  pushdown); otherwise local sort (full matching set read).
- **WriteBatch for createMany/deleteMany (P1-6).** Atomic batches of ≤500
  outside transactions; sequential inside ambient txs. Enforced
  `FIRESTORE_MAX_TRANSACTION_WRITES` / `FIRESTORE_MAX_BATCH_WRITES` (500).
  Multi-create batch duplicate collisions report document id `"unknown"`
  (Admin does not name the colliding op). Soft-deletable reads after a write
  in a transaction throw `FirestoreTransactionReadAfterWriteException`.
  Transactional `createMany` hoists existence reads before writes so N≥2
  does not hit read-after-write.
- `adminStreamBackfillSoftDeleteNull` (BulkWriter stream) for large
  collections; `backfillSoftDeleteNull` remains for small / in-memory.
- Full `WhereOperator` coverage (EQ, NE, comparisons, IN, NIN, null checks,
  string matchers, BETWEEN) with Firestore-native or post-filter execution.
- OR support via `RepositoryAdapter.toDnf()`.
- `skip` / `take` pagination — `orderBy` + `limit(skip + take)` pushed to the
  Firestore Admin SDK so reads scale with the page, not the collection.
- Efficient `count` / `findAndCount` (aggregation when possible).
- Soft delete / restore when `dateRemoved` or `deletedAt` exists on the entity.
- `withDeleted` on find options.
- Exported `ensureFirebaseAdminApp()` for shared Admin bootstrap with auth.

### Release preparation

- Package manifest set to `1.0.0-alpha.8`; registry publication is
  pending.

### Changed

- **The transaction dirty flag is gone.** `FirestoreTransaction.markDirty()`
  / `isDirty` and the repository's private `markDirty` are removed:
  upstream `8.0.0-alpha.10` dropped the same pair from `TypeOrmTransaction`
  and `TypeOrmRepository`, and nothing ever read the flag. It also removed
  `TransactionManager.get()`, which was the only way to reach the
  transaction without starting one.

- `FirestoreRepositoryModule.forRoot({ entities, backend? })` — global bootstrap
  with Admin validation (mirrors `TypeOrmModule.forRoot({ entities })` shape).
  `defineFirestoreRepository().forRoot()` delegates here.
- Backend API: `query()` replaced by `queryBranch()` / `countBranch()` with
  structured query plans.
- Backend API now requires `create()`, providing atomic single-document create
  semantics that reject duplicate ids. `createMany()` remains sequential and
  non-atomic if a later create fails.
- Document-id `EQ` / `IN` predicates compose with ownership and other filters;
  contradictory id predicates resolve to an empty result.
- Generated ids are persisted and returned from `upsert`, and every order
  clause participates in deterministic sorting.
- Admin SDK and in-memory backends share the same local filter and sort
  semantics for direct document lookups and post-filtered queries.
- Unicode map-key ordering in local and post-filter sorts now matches
  Firestore ordering.
- Document-id `IN` accepts at most 500 ids and uses one Admin SDK `getAll`
  request; pagination is applied after all requested ids are fetched.
- README documents supported features and Firestore platform limits.
