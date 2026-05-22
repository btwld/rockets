# Firebase in `sample-code-review`

| Product | Role |
|---------|------|
| **Firebase Auth** | Web login; API validates the ID token |
| **Cloud Firestore** | Reports via `@bitwild/rockets-repository-firestore` + `RepositoryInterface` |

GitHub connection data and profile metadata use **SQLite** (TypeORM, default adapter in `RocketsModule`).

## Rockets registration (backend-agnostic pattern)

```typescript
// analysis.feature.ts
defineModuleResource({
  entities: [{ entity: CodeReviewReportEntity, repository: FirestoreRepositoryModule }],
  providers: [AnalysisService],
});
```

```typescript
// analysis.service.ts
constructor(
  @InjectDynamicRepository(CodeReviewReportEntity)
  private readonly reportRepo: RepositoryInterface<CodeReviewReportEntity>,
) {}
```

Firestore collection: `code_review_reports` (env `FIREBASE_FIRESTORE_REPORTS_COLLECTION`).

## Console

1. Enable Authentication.
2. Enable Firestore Database (Native mode).
3. Add a service account in `apps/api/secrets/firebase-service-account.json` (recommended).

## API `.env`

```env
FIREBASE_PROJECT_ID=rockets-review-demo
# Real Firestore — required for persisted reports (Auth alone is not enough):
FIREBASE_SERVICE_ACCOUNT_PATH=./secrets/firebase-service-account.json
# FIREBASE_FIRESTORE_REPORTS_COLLECTION=code_review_reports
```

**Auth vs Firestore:** Firebase token validation can work with only `FIREBASE_PROJECT_ID`. **Persisting and listing Firestore reports requires a service account** (JSON in `apps/api/secrets/`).

Without the JSON, the sample automatically enables `FIREBASE_FIRESTORE_USE_FAKE=true` (in-memory reports) and logs a warning.

E2E uses `FIREBASE_FIRESTORE_USE_FAKE=true` explicitly in the test setup.
