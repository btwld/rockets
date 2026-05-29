import {
  CodeReviewReportStatus,
  type CodeReviewSectionScore,
  type CodeReviewFinding,
} from './code-review-report.types';

/** Firestore document — registered via `defineFirestoreRepository` in `repository/code-review-reports.persistence.ts`. */
export class CodeReviewReportEntity {
  id!: string;
  userId!: string;
  owner!: string;
  repo!: string;
  fullName!: string;
  status!: CodeReviewReportStatus;
  summary!: string;
  progressMessage!: string | null;
  scorecard!: CodeReviewSectionScore[];
  findings!: CodeReviewFinding[];
  promptUsed!: string;
  dateCreated!: Date;
}
