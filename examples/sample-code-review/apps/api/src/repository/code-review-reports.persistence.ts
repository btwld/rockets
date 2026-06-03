import { defineFirestoreRepository } from '@bitwild/rockets-repository-firestore';

export const CODE_REVIEW_REPORT_COLLECTION =
  process.env.FIREBASE_FIRESTORE_REPORTS_COLLECTION?.trim() ??
  'code_review_reports';

export const codeReviewReportsRepository = defineFirestoreRepository();
