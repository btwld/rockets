import { z } from 'zod';
import { f, rocketsFieldMeta } from '@bitwild/rockets-zod';
import { zodEntityCompiler } from '../zod-bindings';
import { CodeReviewEngine } from './code-review-report.types';

export const codeReviewReportExecutionSchema = z.object({
  id: f.pk(),
  reportId: f.string({ max: 128, unique: true }),
  userId: f.string({ max: 128, index: true }),
  githubLogin: f.string({ max: 128 }),
  reviewEngine: f.enum(CodeReviewEngine, { length: 64 }).nullable(),
  reviewModel: f.string({ max: 128 }).nullable(),
  defaultBranch: f.string({ max: 255 }),
  repositoryLanguage: f.string({ max: 120 }).nullable(),
  sourceFilesCount: f.int({ default: 0 }),
  sourceFilesTruncated: f.bool({ default: false }),
  durationMs: f.int().nullable(),
  dateCompleted: z.date().nullable(),
  dateCreated: z.date().register(rocketsFieldMeta, { db: { createdAt: true } }),
  dateUpdated: z.date().register(rocketsFieldMeta, { db: { updatedAt: true } }),
});

export const CodeReviewReportExecutionEntity = zodEntityCompiler.compileEntity(
  codeReviewReportExecutionSchema,
  {
    name: 'CodeReviewReportExecutionEntity',
    table: 'code_review_report_executions',
  },
);
/** Persistence row type — shares the name with the entity class (value + type). */
export type CodeReviewReportExecutionEntity = z.infer<
  typeof codeReviewReportExecutionSchema
>;
