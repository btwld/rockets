import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { RepositoryInterface, SortOrder, Where } from '@concepta/nestjs-repository';
import type { AppContextInterface } from '@concepta/nestjs-core';

import {
  GITHUB_API_CLIENT,
  type GithubApiClientInterface,
} from '../github/github-client.token';
import { GithubService } from '../github/github.service';
import type { GithubRepoSummary } from '../github/github.types';

import {
  AnalysisReviewProgressStore,
  type AnalysisReviewProgressSnapshot,
} from './analysis-review-progress.store';
import { CodeReviewAnalyzerService } from './code-review-analyzer.service';
import { CodeReviewReportExecutionEntity } from './code-review-report-execution.entity';
import { CodeReviewReportEntity } from './code-review-report.entity';
import {
  CodeReviewReportStatus,
  CodeReviewReportSortField,
  CodeReviewReportSortOrder,
  type ListCodeReviewReportsFilter,
} from './code-review-report.types';
import type { CodeReviewReportView } from './code-review-report.view';
import { InjectDynamicRepository } from '@bitwild/rockets-core';

@Injectable()
export class AnalysisService {
  private readonly logger = new Logger(AnalysisService.name);

  constructor(
    @InjectDynamicRepository(CodeReviewReportEntity)
    private readonly reportRepo: RepositoryInterface<CodeReviewReportEntity>,
    @InjectDynamicRepository(CodeReviewReportExecutionEntity)
    private readonly executionRepo: RepositoryInterface<CodeReviewReportExecutionEntity>,
    private readonly githubService: GithubService,
    @Inject(GITHUB_API_CLIENT)
    private readonly githubClient: GithubApiClientInterface,
    private readonly analyzer: CodeReviewAnalyzerService,
    private readonly progressStore: AnalysisReviewProgressStore,
  ) {}

  async enqueueReview(
    ctx: AppContextInterface,
    userId: string,
    owner: string,
    repo: string,
  ): Promise<CodeReviewReportView> {
    const repos = await this.githubService.listRepositories(ctx, userId);
    const selected = this.findRepo(repos, owner, repo);

    const report = await this.reportRepo.create({
      userId,
      owner: selected.owner,
      repo: selected.name,
      fullName: selected.fullName,
      status: CodeReviewReportStatus.QUEUED,
      summary: 'Review queued',
      progressMessage: 'Waiting to start…',
      scorecard: [],
      findings: [],
      promptUsed: '',
      dateCreated: new Date(),
    });
    const { connection, accessToken } =
      await this.githubService.requireAccessToken(ctx, userId);
    const execution = await this.executionRepo.create({
      reportId: report.id,
      userId: report.userId,
      githubLogin: connection.githubLogin,
      reviewEngine: null,
      reviewModel: null,
      defaultBranch: selected.defaultBranch,
      repositoryLanguage: selected.language,
      sourceFilesCount: 0,
      sourceFilesTruncated: false,
      durationMs: null,
      dateCompleted: null,
    });

    this.progressStore.set({
      reportId: report.id,
      status: CodeReviewReportStatus.QUEUED,
      summary: report.summary,
      progressMessage: report.progressMessage,
    });

    void this.runReviewJob(
      report.userId,
      report.id,
      selected,
      accessToken,
      connection.githubLogin,
    );

    return this.attachExecution(this.mergeProgress(report), execution);
  }

  async listReports(
    userId: string,
    filter: ListCodeReviewReportsFilter = {},
  ): Promise<CodeReviewReportView[]> {
    const rows = await this.reportRepo.find({
      where: Where.eq<CodeReviewReportEntity>('userId', userId),
      order: [{ field: 'dateCreated', order: SortOrder.DESC }],
    });

    const mergedRows = await this.attachExecutions(
      userId,
      rows.map((row) => this.mergeProgress(row)),
    );

    return this.sortReports(this.applyListFilter(mergedRows, filter), filter);
  }

  async getReport(
    userId: string,
    reportId: string,
  ): Promise<CodeReviewReportView> {
    const row = await this.reportRepo.findOne({
      where: Where.and(
        Where.eq<CodeReviewReportEntity>('id', reportId),
        Where.eq<CodeReviewReportEntity>('userId', userId),
      ),
    });
    if (!row) {
      throw new NotFoundException('Code review report not found');
    }
    const report = await this.flushProgressToRepository(row);
    return this.attachExecution(
      report,
      await this.findExecution(userId, report.id),
    );
  }

  private async runReviewJob(
    userId: string,
    reportId: string,
    selected: GithubRepoSummary,
    accessToken: string,
    githubLogin: string,
  ): Promise<void> {
    const startedAt = Date.now();

    try {
      await this.updateProgress(userId, reportId, {
        status: CodeReviewReportStatus.FETCHING,
        summary: 'Fetching repository from GitHub',
        progressMessage: 'Downloading source files and metadata…',
      });

      const inspection = await this.githubClient.inspectRepository(
        accessToken,
        selected.owner,
        selected.name,
      );
      await this.updateExecution(userId, reportId, {
        defaultBranch: inspection.metadata.defaultBranch,
        repositoryLanguage: inspection.metadata.language,
        sourceFilesCount: inspection.sourceFiles.length,
        sourceFilesTruncated: inspection.sourceFilesTruncated,
      });

      await this.updateProgress(userId, reportId, {
        status: CodeReviewReportStatus.ANALYZING,
        summary: 'Analyzing code',
        progressMessage: `Reviewing ${inspection.sourceFiles.length} file(s) with AI…`,
      });

      const analysis = await this.analyzer.analyze({
        inspection,
        githubLogin,
      });

      const base = await this.requireReport(userId, reportId);

      await this.reportRepo.update(base, {
        status: CodeReviewReportStatus.COMPLETED,
        summary: analysis.summary,
        progressMessage: null,
        scorecard: analysis.scorecard,
        findings: analysis.findings,
        promptUsed: analysis.promptUsed,
      });
      await this.updateExecution(userId, reportId, {
        reviewEngine: analysis.reviewEngine,
        reviewModel: analysis.reviewModel,
        defaultBranch: inspection.metadata.defaultBranch,
        repositoryLanguage: inspection.metadata.language,
        sourceFilesCount: inspection.sourceFiles.length,
        sourceFilesTruncated: inspection.sourceFilesTruncated,
        durationMs: Date.now() - startedAt,
        dateCompleted: new Date(),
      });
      this.progressStore.clear(reportId);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Code review failed';
      this.logger.error(`Review job ${reportId} failed: ${message}`);

      try {
        const base = await this.requireReport(userId, reportId);
        await this.reportRepo.update(base, {
          status: CodeReviewReportStatus.FAILED,
          summary: message,
          progressMessage: null,
          scorecard: [],
          findings: [
            {
              severity: 'critical',
              file: '(job)',
              message,
            },
          ],
          promptUsed: 'Job failed before completion',
        });
      } catch {
        /* report missing — nothing to persist */
      }
      await this.updateExecution(userId, reportId, {
        durationMs: Date.now() - startedAt,
        dateCompleted: new Date(),
      });
      this.progressStore.clear(reportId);
    }
  }

  private async updateProgress(
    userId: string,
    reportId: string,
    patch: Pick<
      AnalysisReviewProgressSnapshot,
      'status' | 'summary' | 'progressMessage'
    >,
  ): Promise<void> {
    const current = this.progressStore.get(reportId);
    this.progressStore.set({
      reportId,
      status: patch.status,
      summary: patch.summary,
      progressMessage: patch.progressMessage,
      findings: current?.findings,
      promptUsed: current?.promptUsed,
    });

    const base = await this.requireReport(userId, reportId);
    const merged = this.mergeProgress(base);
    await this.reportRepo.update(base, {
      status: merged.status,
      summary: merged.summary,
      progressMessage: merged.progressMessage,
    });
  }

  private async flushProgressToRepository(
    row: CodeReviewReportEntity,
  ): Promise<CodeReviewReportEntity> {
    const live = this.progressStore.get(row.id);
    if (
      live &&
      this.isTerminalStatus(live.status) &&
      row.status !== live.status
    ) {
      const merged = await this.reportRepo.update(row, {
        status: live.status,
        summary: live.summary,
        progressMessage: live.progressMessage,
        findings: live.findings ?? row.findings,
        promptUsed: live.promptUsed ?? row.promptUsed,
      });
      this.progressStore.clear(row.id);
      return merged;
    }

    return this.mergeProgress(row);
  }

  private async requireReport(
    userId: string,
    reportId: string,
  ): Promise<CodeReviewReportEntity> {
    const row = await this.reportRepo.findOne({
      where: Where.and(
        Where.eq<CodeReviewReportEntity>('id', reportId),
        Where.eq<CodeReviewReportEntity>('userId', userId),
      ),
    });
    if (!row) {
      throw new NotFoundException('Code review report not found');
    }
    return row;
  }

  private async findExecution(
    userId: string,
    reportId: string,
  ): Promise<CodeReviewReportExecutionEntity | undefined> {
    const row = await this.executionRepo.findOne({
      where: Where.and(
        Where.eq<CodeReviewReportExecutionEntity>('reportId', reportId),
        Where.eq<CodeReviewReportExecutionEntity>('userId', userId),
      ),
    });
    return row ?? undefined;
  }

  private async updateExecution(
    userId: string,
    reportId: string,
    patch: Partial<CodeReviewReportExecutionEntity>,
  ): Promise<void> {
    const row = await this.findExecution(userId, reportId);
    if (!row) {
      return;
    }
    await this.executionRepo.update(row, patch);
  }

  private applyListFilter(
    rows: CodeReviewReportView[],
    filter: ListCodeReviewReportsFilter,
  ): CodeReviewReportView[] {
    const github = filter.github?.trim().toLowerCase();
    const q = filter.q?.trim().toLowerCase();
    const status = filter.status;
    const reviewEngine = filter.reviewEngine;

    return rows.filter((entry) => {
      if (status && entry.status !== status) {
        return false;
      }
      if (reviewEngine && entry.execution?.reviewEngine !== reviewEngine) {
        return false;
      }
      if (github && !entry.fullName.toLowerCase().includes(github)) {
        return false;
      }
      if (
        q &&
        !entry.fullName.toLowerCase().includes(q) &&
        !entry.summary.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }

  private sortReports(
    rows: CodeReviewReportView[],
    filter: ListCodeReviewReportsFilter,
  ): CodeReviewReportView[] {
    const sortBy = filter.sortBy ?? CodeReviewReportSortField.DATE_CREATED;
    const sortOrder = filter.sortOrder ?? CodeReviewReportSortOrder.DESC;
    const factor = sortOrder === CodeReviewReportSortOrder.ASC ? 1 : -1;

    return [...rows].sort((left, right) => {
      const comparison = this.compareBySortField(left, right, sortBy);
      if (comparison !== 0) {
        return comparison * factor;
      }
      if (left.id === right.id) {
        return 0;
      }
      return (left.id < right.id ? -1 : 1) * factor;
    });
  }

  private compareBySortField(
    left: CodeReviewReportView,
    right: CodeReviewReportView,
    sortBy: CodeReviewReportSortField,
  ): number {
    if (sortBy === CodeReviewReportSortField.EXECUTION_DATE_CREATED) {
      return compareDates(
        left.execution?.dateCreated,
        right.execution?.dateCreated,
      );
    }

    return compareDates(left.dateCreated, right.dateCreated);
  }

  private isTerminalStatus(status: CodeReviewReportStatus): boolean {
    return (
      status === CodeReviewReportStatus.COMPLETED ||
      status === CodeReviewReportStatus.FAILED
    );
  }

  private mergeProgress(row: CodeReviewReportEntity): CodeReviewReportEntity {
    const live = this.progressStore.get(row.id);
    if (!live) {
      return row;
    }

    return {
      ...row,
      status: live.status,
      summary: live.summary,
      progressMessage: live.progressMessage,
      findings: live.findings ?? row.findings,
      promptUsed: live.promptUsed ?? row.promptUsed,
    };
  }

  private async attachExecutions(
    userId: string,
    rows: CodeReviewReportEntity[],
  ): Promise<CodeReviewReportView[]> {
    if (rows.length === 0) {
      return [];
    }

    const executionRows = await this.executionRepo.find({
      where: Where.eq<CodeReviewReportExecutionEntity>('userId', userId),
    });
    const executionByReportId = new Map(
      executionRows.map((execution) => [execution.reportId, execution] as const),
    );

    return rows.map((row) =>
      this.attachExecution(row, executionByReportId.get(row.id)),
    );
  }

  private attachExecution(
    row: CodeReviewReportEntity,
    execution: CodeReviewReportExecutionEntity | undefined,
  ): CodeReviewReportView {
    return execution ? { ...row, execution } : { ...row };
  }

  private findRepo(
    repos: GithubRepoSummary[],
    owner: string,
    repo: string,
  ): GithubRepoSummary {
    const match = repos.find(
      (r) =>
        r.owner.toLowerCase() === owner.toLowerCase() &&
        r.name.toLowerCase() === repo.toLowerCase(),
    );
    if (!match) {
      throw new ForbiddenException(
        `Repository ${owner}/${repo} is not in the connected GitHub account`,
      );
    }
    return match;
  }
}

function compareDates(
  left: Date | string | null | undefined,
  right: Date | string | null | undefined,
): number {
  const leftTime = resolveTime(left);
  const rightTime = resolveTime(right);

  if (leftTime === rightTime) {
    return 0;
  }
  if (leftTime === null) {
    return 1;
  }
  if (rightTime === null) {
    return -1;
  }
  return leftTime < rightTime ? -1 : 1;
}

function resolveTime(value: Date | string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}
