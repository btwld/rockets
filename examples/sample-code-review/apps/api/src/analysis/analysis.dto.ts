import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

import {
  CodeReviewEngine,
  CodeReviewReportStatus,
  CodeReviewReportSortField,
  CodeReviewReportSortOrder,
  CodeReviewScoreSection,
  type CodeReviewFinding,
  type CodeReviewSectionScore,
} from './code-review-report.types';

export class RunCodeReviewDto {
  @ApiProperty({ example: 'btwld' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  owner!: string;

  @ApiProperty({ example: 'rockets' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  repo!: string;
}

export class ListCodeReviewReportsQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by GitHub repo (matches fullName, e.g. btwld/rockets)',
    example: 'btwld/rockets',
  })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  github?: string;

  @ApiPropertyOptional({
    description: 'Search in summary and repository fullName',
    example: 'security',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @ApiPropertyOptional({ enum: CodeReviewReportStatus })
  @IsOptional()
  @IsEnum(CodeReviewReportStatus)
  status?: CodeReviewReportStatus;

  @ApiPropertyOptional({
    description: 'Filter by execution engine stored in SQLite',
    enum: CodeReviewEngine,
  })
  @IsOptional()
  @IsEnum(CodeReviewEngine)
  reviewEngine?: CodeReviewEngine;

  @ApiPropertyOptional({
    description: 'Sort by a Firestore or SQLite-backed field',
    enum: CodeReviewReportSortField,
  })
  @IsOptional()
  @IsEnum(CodeReviewReportSortField)
  sortBy?: CodeReviewReportSortField;

  @ApiPropertyOptional({
    description: 'Sort direction',
    enum: CodeReviewReportSortOrder,
  })
  @IsOptional()
  @IsEnum(CodeReviewReportSortOrder)
  sortOrder?: CodeReviewReportSortOrder;
}

export class CodeReviewFindingDto implements CodeReviewFinding {
  @ApiProperty({ enum: ['info', 'warning', 'critical'] })
  severity!: 'info' | 'warning' | 'critical';

  @ApiProperty({ example: 'src/main.ts' })
  file!: string;

  @ApiPropertyOptional({ example: 42 })
  line?: number;

  @ApiProperty()
  message!: string;

  @ApiPropertyOptional()
  suggestion?: string;
}

export class CodeReviewSectionScoreDto implements CodeReviewSectionScore {
  @ApiProperty({ enum: CodeReviewScoreSection })
  section!: CodeReviewScoreSection;

  @ApiProperty({ example: 8, minimum: 0, maximum: 10 })
  score!: number;

  @ApiProperty({
    example: 'Architecture is coherent for the product scope, but module boundaries need stronger isolation.',
  })
  summary!: string;
}

export class CodeReviewPersistenceDto {
  @ApiProperty({ example: 'firebase-firestore' })
  reportDocument!: 'firebase-firestore';

  @ApiPropertyOptional({ example: 'sqlite-typeorm' })
  executionRecord?: 'sqlite-typeorm';
}

export class CodeReviewReportExecutionDto {
  @ApiProperty({ example: 'demo-reviewer' })
  githubLogin!: string;

  @ApiProperty({ example: 'sqlite-typeorm' })
  dataSource!: 'sqlite-typeorm';

  @ApiPropertyOptional({ enum: ['openai', 'heuristic'] })
  reviewEngine?: CodeReviewEngine | null;

  @ApiPropertyOptional({ example: 'gpt-4o-mini' })
  reviewModel?: string | null;

  @ApiProperty({ example: 'main' })
  defaultBranch!: string;

  @ApiPropertyOptional({ example: 'TypeScript' })
  repositoryLanguage?: string | null;

  @ApiProperty({ example: 12 })
  sourceFilesCount!: number;

  @ApiProperty()
  sourceFilesTruncated!: boolean;

  @ApiPropertyOptional({ example: 1420 })
  durationMs?: number | null;

  @ApiPropertyOptional()
  dateCompleted?: Date | null;

  @ApiProperty()
  dateCreated!: Date;

  @ApiProperty()
  dateUpdated!: Date;
}

export class CodeReviewReportResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: 'btwld/rockets' })
  fullName!: string;

  @ApiProperty({ example: 'completed' })
  status!: string;

  @ApiProperty()
  summary!: string;

  @ApiProperty({ type: CodeReviewPersistenceDto })
  persistence!: CodeReviewPersistenceDto;

  @ApiPropertyOptional()
  progressMessage?: string | null;

  @ApiProperty({ type: [CodeReviewSectionScoreDto] })
  scorecard!: CodeReviewSectionScoreDto[];

  @ApiProperty({ type: [CodeReviewFindingDto] })
  findings!: CodeReviewFindingDto[];

  @ApiProperty()
  promptUsed!: string;

  @ApiProperty()
  dateCreated!: Date;

  @ApiProperty({
    description: 'Firestore collection/document path (second persistence backend)',
    example: 'code_review_reports/{reportId}',
  })
  documentPath?: string;

  @ApiPropertyOptional({ type: CodeReviewReportExecutionDto })
  execution?: CodeReviewReportExecutionDto;
}

export class CodeReviewReportListItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  fullName!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  summary!: string;

  @ApiProperty({ type: CodeReviewPersistenceDto })
  persistence!: CodeReviewPersistenceDto;

  @ApiPropertyOptional({ type: [CodeReviewSectionScoreDto] })
  scorecard?: CodeReviewSectionScoreDto[];

  @ApiPropertyOptional()
  progressMessage?: string | null;

  @ApiProperty()
  dateCreated!: Date;

  @ApiPropertyOptional()
  documentPath?: string;

  @ApiPropertyOptional({ type: CodeReviewReportExecutionDto })
  execution?: CodeReviewReportExecutionDto;
}
