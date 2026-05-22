import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

import { OpenaiConfig } from '../config/openai.config';
import {
  CodeReviewEngine,
  CodeReviewScoreSection,
  type CodeReviewFinding,
  type CodeReviewSectionScore,
} from './code-review-report.types';
import type {
  CodeReviewAnalysisInput,
  CodeReviewAnalysisResult,
} from './code-review-analyzer.service';

interface OpenAiChatResponse {
  readonly choices?: ReadonlyArray<{
    readonly message?: { readonly content?: string | null };
  }>;
  readonly error?: { readonly message?: string };
}

interface LlmReviewPayload {
  readonly summary?: string;
  readonly scorecard?: ReadonlyArray<{
    readonly section?: string;
    readonly score?: number;
    readonly summary?: string;
  }>;
  readonly findings?: ReadonlyArray<{
    readonly severity?: string;
    readonly file?: string;
    readonly line?: number;
    readonly message?: string;
    readonly suggestion?: string;
  }>;
}

const SYSTEM_PROMPT = `You are a principal software architect reviewing a repository as an implementation of a product idea.
Judge whether the architecture is well designed, secure, and aligned with good engineering practices.
Infer the project idea from the repository metadata, README excerpt, package.json, and source files.
Respond with JSON only:
{
  "summary": "2-4 sentences with an overall verdict",
  "scorecard": [
    {
      "section": "architecture" | "security" | "bestPractices" | "maintainability" | "testing",
      "score": 0-10,
      "summary": "1-2 sentences explaining the score"
    }
  ],
  "findings": [
    {
      "severity": "info" | "warning" | "critical",
      "file": "path",
      "line": 1,
      "message": "what is wrong",
      "suggestion": "how to fix"
    }
  ]
}
Rules:
- Always return all five scorecard sections exactly once.
- Scores are integers from 0 to 10.
- Focus on architecture fitness, security posture, best practices, maintainability, and testing maturity.
- Findings should be concrete and file-specific when possible.
- Max 12 findings.`;

@Injectable()
export class OpenAiCodeReviewClient {
  private readonly logger = new Logger(OpenAiCodeReviewClient.name);

  constructor(private readonly openai: OpenaiConfig) {}

  async analyze(
    input: CodeReviewAnalysisInput,
  ): Promise<CodeReviewAnalysisResult> {
    if (!this.openai.isEnabled) {
      throw new ServiceUnavailableException(
        'OPENAI_API_KEY is not configured on the API',
      );
    }

    const { inspection } = input;
    const fileBlocks = inspection.sourceFiles
      .map(
        (f) =>
          `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``,
      )
      .join('\n\n');

    const userPrompt = [
      `Repository: ${inspection.metadata.fullName}`,
      `Description: ${inspection.metadata.description ?? '(none)'}`,
      `Default branch: ${inspection.metadata.defaultBranch}`,
      `Language: ${inspection.metadata.language ?? 'unknown'}`,
      `Topics: ${inspection.metadata.topics.join(', ') || '(none)'}`,
      `Open issues: ${inspection.metadata.openIssuesCount}`,
      `Repo size (KB): ${inspection.metadata.sizeKb}`,
      `Reviewer GitHub login: ${input.githubLogin}`,
      `README excerpt: ${inspection.readmeExcerpt ?? '(none)'}`,
      `package.json keys: ${inspection.packageJsonKeys.join(', ') || '(none)'}`,
      inspection.sourceFilesTruncated
        ? 'Note: source file list was truncated for size limits.'
        : '',
      '',
      'Source files:',
      fileBlocks || '(no source files fetched)',
    ]
      .filter(Boolean)
      .join('\n');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.openai.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.openai.model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    const body = (await response.json()) as OpenAiChatResponse;
    if (!response.ok) {
      const detail = body.error?.message ?? `HTTP ${response.status}`;
      this.logger.warn(`OpenAI request failed: ${detail}`);
      throw new BadGatewayException(`OpenAI review failed: ${detail}`);
    }

    const raw = body.choices?.[0]?.message?.content;
    if (!raw) {
      throw new BadGatewayException('OpenAI returned an empty response');
    }

    let parsed: LlmReviewPayload;
    try {
      parsed = JSON.parse(raw) as LlmReviewPayload;
    } catch {
      throw new BadGatewayException('OpenAI returned invalid JSON');
    }

    const findings = normalizeFindings(parsed.findings);
    const scorecard = normalizeScorecard(parsed.scorecard);
    const summary =
      typeof parsed.summary === 'string' && parsed.summary.trim().length > 0
        ? parsed.summary.trim()
        : `Architecture review for ${inspection.metadata.fullName}: overall ${averageScorecard(scorecard).toFixed(1)}/10.`;

    const promptUsed = [
      `OpenAI model: ${this.openai.model}`,
      `Repository: ${inspection.metadata.fullName} @ ${inspection.metadata.defaultBranch}`,
      'Review mode: architecture, security, best practices, maintainability, testing.',
      `Files analyzed: ${inspection.sourceFiles.length}${inspection.sourceFilesTruncated ? ' (truncated)' : ''}`,
      `Requested by: ${input.githubLogin}`,
    ].join('\n');

    return {
      summary,
      scorecard,
      findings,
      promptUsed,
      reviewEngine: CodeReviewEngine.OPENAI,
      reviewModel: this.openai.model,
    };
  }
}

function normalizeScorecard(
  raw: LlmReviewPayload['scorecard'],
): CodeReviewSectionScore[] {
  const bySection = new Map<CodeReviewScoreSection, CodeReviewSectionScore>();

  for (const item of raw ?? []) {
    const section = parseSection(item.section);
    if (!section) {
      continue;
    }
    bySection.set(section, {
      section,
      score: clampScore(item.score),
      summary:
        typeof item.summary === 'string' && item.summary.trim().length > 0
          ? item.summary.trim()
          : 'No rationale provided.',
    });
  }

  return REQUIRED_SECTIONS.map((section) => ({
    section,
    score: bySection.get(section)?.score ?? 5,
    summary:
      bySection.get(section)?.summary ??
      'Score not returned by the model; review this section manually.',
  }));
}

function normalizeFindings(
  raw: LlmReviewPayload['findings'],
): CodeReviewFinding[] {
  if (!raw || raw.length === 0) {
    return [
      {
        severity: 'info',
        file: '(repository)',
        message: 'LLM returned no findings.',
      },
    ];
  }

  return raw.slice(0, 12).map((item) => ({
    severity: parseSeverity(item.severity),
    file: item.file?.trim() || '(unknown)',
    line: typeof item.line === 'number' ? item.line : undefined,
    message: item.message?.trim() || 'No message',
    suggestion: item.suggestion?.trim(),
  }));
}

function parseSeverity(value: string | undefined): CodeReviewFinding['severity'] {
  const lower = value?.toLowerCase();
  if (lower === 'critical' || lower === 'warning' || lower === 'info') {
    return lower;
  }
  return 'info';
}

const REQUIRED_SECTIONS = [
  CodeReviewScoreSection.ARCHITECTURE,
  CodeReviewScoreSection.SECURITY,
  CodeReviewScoreSection.BEST_PRACTICES,
  CodeReviewScoreSection.MAINTAINABILITY,
  CodeReviewScoreSection.TESTING,
] as const;

function parseSection(
  value: string | undefined,
): CodeReviewScoreSection | undefined {
  const normalized = value?.trim();
  switch (normalized) {
    case CodeReviewScoreSection.ARCHITECTURE:
    case CodeReviewScoreSection.SECURITY:
    case CodeReviewScoreSection.BEST_PRACTICES:
    case CodeReviewScoreSection.MAINTAINABILITY:
    case CodeReviewScoreSection.TESTING:
      return normalized;
    default:
      return undefined;
  }
}

function clampScore(value: number | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 5;
  }
  return Math.max(0, Math.min(10, Math.round(value)));
}

function averageScorecard(scorecard: readonly CodeReviewSectionScore[]): number {
  if (scorecard.length === 0) {
    return 0;
  }
  const total = scorecard.reduce((sum, item) => sum + item.score, 0);
  return total / scorecard.length;
}
