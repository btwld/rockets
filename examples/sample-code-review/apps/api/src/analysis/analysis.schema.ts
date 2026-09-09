import { z } from 'zod';
import { withOpenApi } from '@concepta/rockets-core';

import {
  CodeReviewEngine,
  CodeReviewReportStatus,
  CodeReviewReportSortField,
  CodeReviewReportSortOrder,
  CodeReviewScoreSection,
} from './code-review-report.types';

/**
 * Request/response schemas for the analysis controller. Each named one is
 * wrapped LAST with `withOpenApi(schema, id)` so the class-level Standard
 * Schema pipe validates the body, the serializer interceptor projects the
 * response and Swagger emits the named component (`$ref`).
 */
export const runCodeReviewSchema = withOpenApi(
  z.object({
    owner: z.string().min(1).max(128).meta({ example: 'conceptadev' }),
    repo: z.string().min(1).max(255).meta({ example: 'rockets' }),
  }),
  'RunCodeReviewDto',
);
export type RunCodeReviewBody = z.output<typeof runCodeReviewSchema>;

/**
 * Unnamed on purpose: an unnamed bridged object on `@Query({ schema })` is
 * expanded by Swagger into one query parameter per property, instead of a
 * `$ref` to a component (which query strings cannot be).
 */
export const listCodeReviewReportsQuerySchema = withOpenApi(
  z.object({
    github: z
      .string()
      .max(512)
      .meta({
        description:
          'Filter by GitHub repo (matches fullName, e.g. conceptadev/rockets)',
        example: 'conceptadev/rockets',
      })
      .optional(),
    q: z
      .string()
      .max(200)
      .meta({
        description: 'Search in summary and repository fullName',
        example: 'security',
      })
      .optional(),
    status: z.enum(CodeReviewReportStatus).optional(),
    reviewEngine: z
      .enum(CodeReviewEngine)
      .meta({ description: 'Filter by execution engine stored in SQLite' })
      .optional(),
    sortBy: z
      .enum(CodeReviewReportSortField)
      .meta({ description: 'Sort by a Firestore or SQLite-backed field' })
      .optional(),
    sortOrder: z
      .enum(CodeReviewReportSortOrder)
      .meta({ description: 'Sort direction' })
      .optional(),
  }),
);
export type ListCodeReviewReportsQuery = z.output<
  typeof listCodeReviewReportsQuerySchema
>;

export const codeReviewFindingSchema = withOpenApi(
  z.object({
    severity: z.enum(['info', 'warning', 'critical']),
    file: z.string().meta({ example: 'src/main.ts' }),
    line: z.number().int().meta({ example: 42 }).optional(),
    message: z.string(),
    suggestion: z.string().optional(),
  }),
  'CodeReviewFindingDto',
);

export const codeReviewSectionScoreSchema = withOpenApi(
  z.object({
    section: z.enum(CodeReviewScoreSection),
    score: z.number().min(0).max(10).meta({ example: 8 }),
    summary: z.string().meta({
      example:
        'Architecture is coherent for the product scope, but module boundaries need stronger isolation.',
    }),
  }),
  'CodeReviewSectionScoreDto',
);

export const codeReviewPersistenceSchema = withOpenApi(
  z.object({
    reportDocument: z.literal('firebase-firestore'),
    executionRecord: z.literal('sqlite-typeorm').optional(),
  }),
  'CodeReviewPersistenceDto',
);
export type CodeReviewPersistence = z.output<
  typeof codeReviewPersistenceSchema
>;

export const codeReviewReportExecutionSchema = withOpenApi(
  z.object({
    githubLogin: z.string().meta({ example: 'demo-reviewer' }),
    dataSource: z.literal('sqlite-typeorm'),
    reviewEngine: z.enum(CodeReviewEngine).nullable().optional(),
    reviewModel: z.string().meta({ example: 'gpt-4o-mini' }).nullable().optional(),
    defaultBranch: z.string().meta({ example: 'main' }),
    repositoryLanguage: z
      .string()
      .meta({ example: 'TypeScript' })
      .nullable()
      .optional(),
    sourceFilesCount: z.number().int().meta({ example: 12 }),
    sourceFilesTruncated: z.boolean(),
    durationMs: z.number().int().meta({ example: 1420 }).nullable().optional(),
    dateCompleted: z.date().nullable().optional(),
    dateCreated: z.date(),
    dateUpdated: z.date(),
  }),
  'CodeReviewReportExecutionDto',
);
export type CodeReviewReportExecution = z.output<
  typeof codeReviewReportExecutionSchema
>;

export const codeReviewReportResponseSchema = withOpenApi(
  z.object({
    id: z.string(),
    fullName: z.string().meta({ example: 'conceptadev/rockets' }),
    status: z.enum(CodeReviewReportStatus),
    summary: z.string(),
    persistence: codeReviewPersistenceSchema,
    progressMessage: z.string().nullable().optional(),
    scorecard: z.array(codeReviewSectionScoreSchema),
    findings: z.array(codeReviewFindingSchema),
    promptUsed: z.string(),
    dateCreated: z.date(),
    documentPath: z.string().meta({
      description:
        'Firestore collection/document path (second persistence backend)',
      example: 'code_review_reports/{reportId}',
    }),
    execution: codeReviewReportExecutionSchema.optional(),
  }),
  'CodeReviewReportResponseDto',
);
export type CodeReviewReportResponse = z.output<
  typeof codeReviewReportResponseSchema
>;

export const codeReviewReportListItemSchema = withOpenApi(
  z.object({
    id: z.string(),
    fullName: z.string(),
    status: z.enum(CodeReviewReportStatus),
    summary: z.string(),
    persistence: codeReviewPersistenceSchema,
    scorecard: z.array(codeReviewSectionScoreSchema).optional(),
    progressMessage: z.string().nullable().optional(),
    dateCreated: z.date(),
    documentPath: z.string().optional(),
    execution: codeReviewReportExecutionSchema.optional(),
  }),
  'CodeReviewReportListItemDto',
);
export type CodeReviewReportListItem = z.output<
  typeof codeReviewReportListItemSchema
>;

/**
 * Swagger-only: `@ApiResponse({ standardSchema })` ignores `isArray`, so the
 * list route documents an unnamed bridged array whose items `$ref` the
 * named component. Serialization uses the item schema — the serializer
 * interceptor maps arrays per item.
 */
export const codeReviewReportListSchema = withOpenApi(
  z.array(codeReviewReportListItemSchema),
);
