import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Ctx, type AppContextInterface } from '@concepta/nestjs-core';
import type { AuthorizedUser } from '@bitwild/rockets';

import {
  CodeReviewReportListItemDto,
  CodeReviewReportExecutionDto,
  CodeReviewReportResponseDto,
  CodeReviewSectionScoreDto,
  ListCodeReviewReportsQueryDto,
  RunCodeReviewDto,
} from './analysis.dto';
import { AnalysisService } from './analysis.service';
import { CodeReviewReportEntity } from './code-review-report.entity';
import { CodeReviewReportExecutionEntity } from './code-review-report-execution.entity';
import type { CodeReviewReportView } from './code-review-report.view';
import { CODE_REVIEW_REPORT_COLLECTION } from '../repository/code-review-reports.persistence';
import { AuthUser } from '@bitwild/rockets-core';

@ApiTags('Code review')
@ApiBearerAuth()
@Controller('analysis')
export class AnalysisController {
  constructor(private readonly analysisService: AnalysisService) {}

  @Post('review')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary:
      'Enqueue code review (reports persist in Firestore; poll GET /analysis/reports/:id)',
  })
  async runReview(
    @Ctx() ctx: AppContextInterface,
    @AuthUser() user: AuthorizedUser,
    @Body() dto: RunCodeReviewDto,
  ): Promise<CodeReviewReportResponseDto> {
    const report = await this.analysisService.enqueueReview(
      ctx,
      user.id,
      dto.owner,
      dto.repo,
    );
    return toDetail(report);
  }

  @Get('reports')
  @ApiOperation({
    summary:
      'List reports from Firestore (filter by github repo, text, status)',
  })
  async listReports(
    @AuthUser() user: AuthorizedUser,
    @Query() query: ListCodeReviewReportsQueryDto,
  ): Promise<CodeReviewReportListItemDto[]> {
    const rows = await this.analysisService.listReports(user.id, {
      github: query.github,
      q: query.q,
      status: query.status,
      reviewEngine: query.reviewEngine,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });
    return rows.map((r) => toListItem(r));
  }

  @Get('reports/:reportId')
  @ApiOperation({ summary: 'Get full report document from Firestore' })
  async getReport(
    @AuthUser() user: AuthorizedUser,
    @Param('reportId', new ParseUUIDPipe()) reportId: string,
  ): Promise<CodeReviewReportResponseDto> {
    const report = await this.analysisService.getReport(user.id, reportId);
    return toDetail(report);
  }
}

function documentPath(report: CodeReviewReportEntity): string {
  return `${CODE_REVIEW_REPORT_COLLECTION}/${report.id}`;
}

function toExecution(
  execution: CodeReviewReportExecutionEntity | undefined,
): CodeReviewReportExecutionDto | undefined {
  if (!execution) {
    return undefined;
  }

  return {
    githubLogin: execution.githubLogin,
    dataSource: 'sqlite-typeorm',
    reviewEngine: execution.reviewEngine,
    reviewModel: execution.reviewModel,
    defaultBranch: execution.defaultBranch,
    repositoryLanguage: execution.repositoryLanguage,
    sourceFilesCount: execution.sourceFilesCount,
    sourceFilesTruncated: execution.sourceFilesTruncated,
    durationMs: execution.durationMs,
    dateCompleted: execution.dateCompleted,
    dateCreated: execution.dateCreated,
    dateUpdated: execution.dateUpdated,
  };
}

function toScorecard(report: CodeReviewReportEntity): CodeReviewSectionScoreDto[] {
  return report.scorecard ?? [];
}

function toPersistence(
  report: CodeReviewReportView,
): CodeReviewReportResponseDto['persistence'] {
  return {
    reportDocument: 'firebase-firestore',
    executionRecord: report.execution ? 'sqlite-typeorm' : undefined,
  };
}

function toDetail(report: CodeReviewReportView): CodeReviewReportResponseDto {
  return {
    id: report.id,
    fullName: report.fullName,
    status: report.status,
    summary: report.summary,
    persistence: toPersistence(report),
    progressMessage: report.progressMessage,
    scorecard: toScorecard(report),
    findings: report.findings,
    promptUsed: report.promptUsed,
    dateCreated: report.dateCreated,
    documentPath: documentPath(report),
    execution: toExecution(report.execution),
  };
}

function toListItem(report: CodeReviewReportView): CodeReviewReportListItemDto {
  return {
    id: report.id,
    fullName: report.fullName,
    status: report.status,
    summary: report.summary,
    persistence: toPersistence(report),
    scorecard: toScorecard(report),
    progressMessage: report.progressMessage,
    dateCreated: report.dateCreated,
    documentPath: documentPath(report),
    execution: toExecution(report.execution),
  };
}
