import { Injectable, Logger } from '@nestjs/common';

import { OpenaiConfig } from '../config/openai.config';
import type { GithubRepoInspection } from '../github/github.types';
import {
  CodeReviewEngine as CodeReviewEngineEnum,
  type CodeReviewEngine,
  type CodeReviewFinding,
  CodeReviewScoreSection,
  type CodeReviewSectionScore,
} from './code-review-report.types';
import { OpenAiCodeReviewClient } from './openai-code-review.client';

export interface CodeReviewAnalysisInput {
  readonly inspection: GithubRepoInspection;
  readonly githubLogin: string;
}

export interface CodeReviewAnalysisResult {
  readonly summary: string;
  readonly scorecard: CodeReviewSectionScore[];
  readonly findings: CodeReviewFinding[];
  readonly promptUsed: string;
  readonly reviewEngine: CodeReviewEngine;
  readonly reviewModel: string | null;
}

/**
 * Uses OpenAI when `OPENAI_API_KEY` (or `OPEN_API_KEY`) is set;
 * otherwise falls back to rule-based checks.
 */
@Injectable()
export class CodeReviewAnalyzerService {
  private readonly logger = new Logger(CodeReviewAnalyzerService.name);

  constructor(
    private readonly openai: OpenaiConfig,
    private readonly openAiClient: OpenAiCodeReviewClient,
  ) {}

  async analyze(
    input: CodeReviewAnalysisInput,
  ): Promise<CodeReviewAnalysisResult> {
    if (this.openai.isEnabled) {
      try {
        return await this.openAiClient.analyze(input);
      } catch (error) {
        this.logger.warn(
          `OpenAI review failed, using heuristic fallback: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return this.analyzeWithHeuristics(input);
  }

  private analyzeWithHeuristics(
    input: CodeReviewAnalysisInput,
  ): CodeReviewAnalysisResult {
    const { metadata } = input.inspection;
    const promptUsed = [
      'Heuristic architecture review (no OpenAI or OpenAI failed).',
      `Repository: ${metadata.fullName} @ ${metadata.defaultBranch}.`,
      `Language: ${metadata.language ?? 'unknown'}. Stars: ${metadata.stargazersCount}.`,
      `Source files fetched: ${input.inspection.sourceFiles.length}.`,
      `Requested by: ${input.githubLogin}.`,
    ].join('\n');

    const findings: CodeReviewFinding[] = [];
    const scorecard = buildHeuristicScorecard(input.inspection);

    if (!input.inspection.hasReadme) {
      findings.push({
        severity: 'warning',
        file: 'README.md',
        message: 'No README at repository root — onboarding and scope are unclear.',
        suggestion: 'Add a README with setup, architecture, and contribution notes.',
      });
    }

    if (!input.inspection.hasPackageJson) {
      findings.push({
        severity: 'info',
        file: 'package.json',
        message: 'No package.json at root — may not be a Node/TypeScript service.',
      });
    } else if (!input.inspection.packageJsonKeys.includes('scripts')) {
      findings.push({
        severity: 'warning',
        file: 'package.json',
        message: 'package.json has no scripts block — CI/local dev entrypoints missing.',
      });
    }

    if (input.inspection.sourceFiles.length === 0) {
      findings.push({
        severity: 'warning',
        file: '(repository)',
        message: 'No reviewable source files were fetched from GitHub.',
        suggestion:
          'Check repo visibility, OAuth scopes (repo), and file extensions.',
      });
    }

    if (input.inspection.sourceFilesTruncated) {
      findings.push({
        severity: 'info',
        file: '(repository)',
        message:
          'Source file list was truncated — review may be incomplete.',
      });
    }

    if (metadata.openIssuesCount > 20) {
      findings.push({
        severity: 'info',
        file: '(repository)',
        message: `High open issue count (${metadata.openIssuesCount}) — triage before large refactors.`,
      });
    }

    if (findings.length === 0) {
      findings.push({
        severity: 'info',
        file: 'README.md',
        message:
          'Baseline architecture checks passed. Set OPENAI_API_KEY for a deeper LLM review.',
      });
    }

    const critical = findings.filter((f) => f.severity === 'critical').length;
    const warning = findings.filter((f) => f.severity === 'warning').length;
    const info = findings.filter((f) => f.severity === 'info').length;
    const averageScore = averageScorecard(scorecard);

    return {
      promptUsed,
      summary:
        `Architecture review for ${metadata.fullName}: ` +
        `overall ${averageScore.toFixed(1)}/10, ${findings.length} finding(s) ` +
        `(${critical} critical, ${warning} warning, ${info} info).`,
      scorecard,
      findings,
      reviewEngine: CodeReviewEngineEnum.HEURISTIC,
      reviewModel: null,
    };
  }
}

function buildHeuristicScorecard(
  inspection: GithubRepoInspection,
): CodeReviewSectionScore[] {
  const scriptsPresent =
    inspection.packageJsonKeys.includes('scripts') ||
    hasPattern(inspection, /"scripts"\s*:/);
  const hasTests =
    inspection.sourceFiles.some((file) => /(spec|test)\.[cm]?[jt]sx?$/i.test(file.path)) ||
    hasPattern(inspection, /\b(jest|vitest|playwright|cypress|mocha)\b/i);
  const riskySecrets = hasPattern(
    inspection,
    /\b(ghp_[A-Za-z0-9]+|gho_[A-Za-z0-9]+|sk-[A-Za-z0-9]+|AKIA[0-9A-Z]{16}|BEGIN RSA PRIVATE KEY)\b/,
  );
  const riskySecurityPatterns = hasPattern(
    inspection,
    /\b(eval\s*\(|innerHTML\s*=|http:\/\/|rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0)/,
  );

  const architectureScore = clampScore(
    5 +
      Number(inspection.hasReadme) +
      Number(inspection.hasPackageJson) +
      Number(scriptsPresent) -
      Number(inspection.sourceFiles.length === 0) * 3 -
      Number(inspection.sourceFilesTruncated),
  );

  const securityScore = clampScore(
    7 - Number(riskySecurityPatterns) * 2 - Number(riskySecrets) * 4,
  );

  const bestPracticesScore = clampScore(
    5 +
      Number(scriptsPresent) +
      Number(inspection.hasReadme) +
      Number(inspection.packageJsonKeys.includes('dependencies')) -
      Number(!inspection.hasPackageJson) * 2,
  );

  const maintainabilityScore = clampScore(
    5 +
      Number(inspection.hasReadme) +
      Number(inspection.metadata.description !== null) -
      Number(inspection.sourceFilesTruncated) -
      Number(inspection.sourceFiles.length === 0) * 2,
  );

  const testingScore = clampScore(
    3 + Number(hasTests) * 4 + Number(scriptsPresent) - Number(!hasTests),
  );

  return [
    {
      section: CodeReviewScoreSection.ARCHITECTURE,
      score: architectureScore,
      summary:
        architectureScore >= 8
          ? 'Repository signals a coherent structure for the stated scope.'
          : architectureScore >= 6
            ? 'Architecture looks workable, but some structural signals are still thin.'
            : 'Architecture signals are weak; project structure and entrypoints are not convincing yet.',
    },
    {
      section: CodeReviewScoreSection.SECURITY,
      score: securityScore,
      summary:
        securityScore >= 8
          ? 'No obvious insecure patterns were detected in the fetched files.'
          : securityScore >= 6
            ? 'No catastrophic issue was detected, but security confidence is only moderate.'
            : 'Fetched files contain security smells or secret-like material that need review.',
    },
    {
      section: CodeReviewScoreSection.BEST_PRACTICES,
      score: bestPracticesScore,
      summary:
        bestPracticesScore >= 8
          ? 'Repository shows several healthy implementation and packaging conventions.'
          : bestPracticesScore >= 6
            ? 'Some best-practice signals exist, but the setup is not fully mature.'
            : 'Basic project hygiene and engineering conventions are still inconsistent.',
    },
    {
      section: CodeReviewScoreSection.MAINTAINABILITY,
      score: maintainabilityScore,
      summary:
        maintainabilityScore >= 8
          ? 'Docs and repository metadata support long-term maintenance.'
          : maintainabilityScore >= 6
            ? 'Maintainability is acceptable, but documentation and structure could be stronger.'
            : 'Maintenance risk is high because documentation or structure is too weak.',
    },
    {
      section: CodeReviewScoreSection.TESTING,
      score: testingScore,
      summary:
        testingScore >= 8
          ? 'Testing signals are strong in the files that were inspected.'
          : testingScore >= 6
            ? 'There are some testing signals, but coverage maturity is unclear.'
            : 'Testing evidence is weak or absent in the inspected repository slice.',
    },
  ];
}

function hasPattern(
  inspection: GithubRepoInspection,
  pattern: RegExp,
): boolean {
  return inspection.sourceFiles.some((file) => pattern.test(file.content));
}

function averageScorecard(scorecard: readonly CodeReviewSectionScore[]): number {
  if (scorecard.length === 0) {
    return 0;
  }
  const total = scorecard.reduce((sum, item) => sum + item.score, 0);
  return total / scorecard.length;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(10, Math.round(value)));
}
