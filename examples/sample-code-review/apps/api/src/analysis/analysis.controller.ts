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
  SerializeOptions,
  StandardSchemaSerializerInterceptor,
  StandardSchemaValidationPipe,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Ctx, type AppContextInterface } from '@concepta/nestjs-core';
import type { AuthorizedUser } from '@concepta/rockets';
import { AuthUser, rocketsSchemaValidation } from '@concepta/rockets-core';

import {
  codeReviewReportListItemSchema,
  codeReviewReportListSchema,
  codeReviewReportResponseSchema,
  listCodeReviewReportsQuerySchema,
  runCodeReviewSchema,
  type CodeReviewPersistence,
  type CodeReviewReportExecution,
  type CodeReviewReportListItem,
  type CodeReviewReportResponse,
  type ListCodeReviewReportsQuery,
  type RunCodeReviewBody,
} from './analysis.schema';
import { AnalysisService } from './analysis.service';
import { CodeReviewReportEntity } from './code-review-report.entity';
import { CodeReviewReportExecutionEntity } from './code-review-report-execution.entity';
import type { CodeReviewReportView } from './code-review-report.view';
import { CODE_REVIEW_REPORT_COLLECTION } from '../repository/code-review-reports.persistence';

@ApiTags('Code review')
@ApiBearerAuth()
@Controller('analysis')
@UsePipes(new StandardSchemaValidationPipe(rocketsSchemaValidation))
@UseInterceptors(StandardSchemaSerializerInterceptor)
export class AnalysisController {
  constructor(private readonly analysisService: AnalysisService) {}

  @Post('review')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary:
      'Enqueue code review (reports persist in Firestore; poll GET /analysis/reports/:id)',
  })
  @ApiResponse({ status: 202, standardSchema: codeReviewReportResponseSchema })
  @SerializeOptions({ schema: codeReviewReportResponseSchema })
  async runReview(
    @Ctx() ctx: AppContextInterface,
    @AuthUser() user: AuthorizedUser,
    @Body({ schema: runCodeReviewSchema }) dto: RunCodeReviewBody,
  ): Promise<CodeReviewReportResponse> {
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
  @ApiResponse({ status: 200, standardSchema: codeReviewReportListSchema })
  @SerializeOptions({ schema: codeReviewReportListItemSchema })
  async listReports(
    @AuthUser() user: AuthorizedUser,
    @Query({ schema: listCodeReviewReportsQuerySchema })
    query: ListCodeReviewReportsQuery,
  ): Promise<CodeReviewReportListItem[]> {
    const rows = await this.analysisService.listReports(user.id, query);
    return rows.map((r) => toListItem(r));
  }

  @Get('reports/:reportId')
  @ApiOperation({ summary: 'Get full report document from Firestore' })
  @ApiResponse({ status: 200, standardSchema: codeReviewReportResponseSchema })
  @SerializeOptions({ schema: codeReviewReportResponseSchema })
  async getReport(
    @AuthUser() user: AuthorizedUser,
    @Param('reportId', new ParseUUIDPipe()) reportId: string,
  ): Promise<CodeReviewReportResponse> {
    const report = await this.analysisService.getReport(user.id, reportId);
    return toDetail(report);
  }
}

function documentPath(report: CodeReviewReportEntity): string {
  return `${CODE_REVIEW_REPORT_COLLECTION}/${report.id}`;
}

function toExecution(
  execution: CodeReviewReportExecutionEntity | undefined,
): CodeReviewReportExecution | undefined {
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

function toPersistence(report: CodeReviewReportView): CodeReviewPersistence {
  return {
    reportDocument: 'firebase-firestore',
    executionRecord: report.execution ? 'sqlite-typeorm' : undefined,
  };
}

function toDetail(report: CodeReviewReportView): CodeReviewReportResponse {
  return {
    id: report.id,
    fullName: report.fullName,
    status: report.status,
    summary: report.summary,
    persistence: toPersistence(report),
    progressMessage: report.progressMessage,
    scorecard: report.scorecard ?? [],
    findings: report.findings,
    promptUsed: report.promptUsed,
    dateCreated: report.dateCreated,
    documentPath: documentPath(report),
    execution: toExecution(report.execution),
  };
}

function toListItem(report: CodeReviewReportView): CodeReviewReportListItem {
  return {
    id: report.id,
    fullName: report.fullName,
    status: report.status,
    summary: report.summary,
    persistence: toPersistence(report),
    scorecard: report.scorecard ?? [],
    progressMessage: report.progressMessage,
    dateCreated: report.dateCreated,
    documentPath: documentPath(report),
    execution: toExecution(report.execution),
  };
}
