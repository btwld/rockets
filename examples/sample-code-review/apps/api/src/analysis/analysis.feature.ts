import { defineModuleResource } from '@bitwild/rockets-core';
import { FirestoreRepositoryModule } from '@bitwild/rockets-repository-firestore';

import { OpenaiConfig } from '../config/openai.config';
import './register-code-review-firestore';
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
      repository: FirestoreRepositoryModule,
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
