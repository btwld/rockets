export enum CodeReviewReportStatus {
  QUEUED = 'queued',
  FETCHING = 'fetching',
  ANALYZING = 'analyzing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum CodeReviewEngine {
  OPENAI = 'openai',
  HEURISTIC = 'heuristic',
}

export enum CodeReviewScoreSection {
  ARCHITECTURE = 'architecture',
  SECURITY = 'security',
  BEST_PRACTICES = 'bestPractices',
  MAINTAINABILITY = 'maintainability',
  TESTING = 'testing',
}

export enum CodeReviewReportSortField {
  DATE_CREATED = 'dateCreated',
  EXECUTION_DATE_CREATED = 'executionDateCreated',
}

export enum CodeReviewReportSortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export interface CodeReviewFinding {
  readonly severity: 'info' | 'warning' | 'critical';
  readonly file: string;
  readonly line?: number;
  readonly message: string;
  readonly suggestion?: string;
}

export interface CodeReviewSectionScore {
  readonly section: CodeReviewScoreSection;
  readonly score: number;
  readonly summary: string;
}

export interface ListCodeReviewReportsFilter {
  readonly github?: string;
  readonly q?: string;
  readonly status?: CodeReviewReportStatus;
  readonly reviewEngine?: CodeReviewEngine;
  readonly sortBy?: CodeReviewReportSortField;
  readonly sortOrder?: CodeReviewReportSortOrder;
}
