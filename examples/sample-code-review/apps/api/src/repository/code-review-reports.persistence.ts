import { CodeReviewReportEntity } from '../analysis/code-review-report.entity';
import { defineFirestoreRepository } from './define-firestore-repository';

export const CODE_REVIEW_REPORT_COLLECTION =
  process.env.FIREBASE_FIRESTORE_REPORTS_COLLECTION?.trim() ??
  'code_review_reports';

/** Same shape as `defineTypeOrmRepository` — pass directly to `repository:` on an entity row or at root. */
export const codeReviewReportsRepository = defineFirestoreRepository({
  entities: [
    { entity: CodeReviewReportEntity, collection: CODE_REVIEW_REPORT_COLLECTION },
  ],
});
