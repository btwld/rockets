import { CodeReviewReportEntity } from './code-review-report.entity';
import { CodeReviewReportExecutionEntity } from './code-review-report-execution.entity';

export type CodeReviewReportView = CodeReviewReportEntity & {
  readonly execution?: CodeReviewReportExecutionEntity;
};
