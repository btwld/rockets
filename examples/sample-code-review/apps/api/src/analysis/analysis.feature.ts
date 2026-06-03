import { defineModuleResource } from '@bitwild/rockets-core';

import { OpenaiConfig } from '../config/openai.config';
import {
  codeReviewReportsRepository,
  CODE_REVIEW_REPORT_COLLECTION,
} from '../repository/code-review-reports.persistence';
import { AnalysisReviewProgressStore } from './analysis-review-progress.store';
import { AnalysisController } from './analysis.controller';
import { CodeReviewReportExecutionEntity } from './code-review-report-execution.entity';
import { AnalysisService } from './analysis.service';
import { CodeReviewAnalyzerService } from './code-review-analyzer.service';
import { CodeReviewReportEntity } from './code-review-report.entity';
import { OpenAiCodeReviewClient } from './openai-code-review.client';

export const analysisFeature = defineModuleResource({
  entities: [
    CodeReviewReportExecutionEntity,
    {
      entity: CodeReviewReportEntity,
      repository: codeReviewReportsRepository,
      collection: CODE_REVIEW_REPORT_COLLECTION,
    },
  ],
  controllers: [AnalysisController],
  providers: [
    OpenaiConfig,
    OpenAiCodeReviewClient,
    AnalysisReviewProgressStore,
    AnalysisService,
    CodeReviewAnalyzerService,
  ],
  exports: [AnalysisService],
});
