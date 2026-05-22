import { Injectable } from '@nestjs/common';

import type { CodeReviewFinding } from './code-review-report.types';
import { CodeReviewReportStatus } from './code-review-report.types';

export interface AnalysisReviewProgressSnapshot {
  readonly reportId: string;
  readonly status: CodeReviewReportStatus;
  readonly summary: string;
  readonly progressMessage: string | null;
  readonly findings?: CodeReviewFinding[];
  readonly promptUsed?: string;
}

/**
 * In-memory job progress (HTTP request `ctx` cannot be reused after 202).
 * `GET /analysis/reports/:id` merges an active snapshot over the DB row.
 */
@Injectable()
export class AnalysisReviewProgressStore {
  private readonly active = new Map<string, AnalysisReviewProgressSnapshot>();

  set(snapshot: AnalysisReviewProgressSnapshot): void {
    this.active.set(snapshot.reportId, snapshot);
  }

  get(reportId: string): AnalysisReviewProgressSnapshot | undefined {
    return this.active.get(reportId);
  }

  clear(reportId: string): void {
    this.active.delete(reportId);
  }
}
