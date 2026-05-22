import {
  ApiError,
  isAuthFailureMessage,
  isAuthFailureStatus,
} from './api-errors';
import { invalidateSession } from './session';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export interface UserMetadataPayload {
  id?: string;
  firstName?: string;
  lastName?: string;
}

export interface UserMetadataView extends UserMetadataPayload {
  userId?: string;
  dateCreated?: string;
  dateUpdated?: string;
}

export interface MeResponse {
  id: string;
  email?: string;
  userMetadata?: UserMetadataView | Record<string, unknown>;
}

export interface GithubRepo {
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  language?: string;
  private: boolean;
}

export interface CodeReviewFinding {
  severity: 'info' | 'warning' | 'critical';
  file: string;
  line?: number;
  message: string;
  suggestion?: string;
}

export type CodeReviewReportStatus =
  | 'queued'
  | 'fetching'
  | 'analyzing'
  | 'completed'
  | 'failed';

export type CodeReviewEngine = 'openai' | 'heuristic';
export type CodeReviewScoreSection =
  | 'architecture'
  | 'security'
  | 'bestPractices'
  | 'maintainability'
  | 'testing';
export type CodeReviewReportSortField =
  | 'dateCreated'
  | 'executionDateCreated';
export type CodeReviewReportSortOrder = 'asc' | 'desc';

export function isReviewFinished(status: string): boolean {
  return status === 'completed' || status === 'failed';
}

export interface CodeReviewReportExecution {
  githubLogin: string;
  dataSource: 'sqlite-typeorm';
  reviewEngine?: CodeReviewEngine | null;
  reviewModel?: string | null;
  defaultBranch: string;
  repositoryLanguage?: string | null;
  sourceFilesCount: number;
  sourceFilesTruncated: boolean;
  durationMs?: number | null;
  dateCompleted?: string | null;
  dateCreated: string;
  dateUpdated: string;
}

export interface CodeReviewSectionScore {
  section: CodeReviewScoreSection;
  score: number;
  summary: string;
}

export interface CodeReviewPersistence {
  reportDocument: 'firebase-firestore';
  executionRecord?: 'sqlite-typeorm';
}

export interface CodeReviewReportListItem {
  id: string;
  fullName: string;
  status: CodeReviewReportStatus;
  summary: string;
  persistence: CodeReviewPersistence;
  scorecard?: CodeReviewSectionScore[];
  progressMessage?: string | null;
  dateCreated: string;
  /** Firestore document path (reports are not in SQLite). */
  documentPath?: string;
  execution?: CodeReviewReportExecution;
}

export interface CodeReviewReport extends CodeReviewReportListItem {
  findings: CodeReviewFinding[];
  promptUsed: string;
  scorecard: CodeReviewSectionScore[];
}

export interface ListReportsFilter {
  readonly github?: string;
  readonly q?: string;
  readonly status?: CodeReviewReportStatus;
  readonly reviewEngine?: CodeReviewEngine;
  readonly sortBy?: CodeReviewReportSortField;
  readonly sortOrder?: CodeReviewReportSortOrder;
}

interface ApiFetchOptions {
  /** When true, 401 does not sign out (used on the login form to show API errors). */
  readonly skipSessionInvalidation?: boolean;
}

async function apiFetch<T>(
  path: string,
  token: string,
  init?: RequestInit,
  options?: ApiFetchOptions,
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    let message = text;
    try {
      const json = JSON.parse(text) as { message?: string | string[] };
      message = Array.isArray(json.message)
        ? json.message.join(', ')
        : (json.message ?? text);
    } catch {
      /* keep raw text */
    }
    const resolved = message || `HTTP ${response.status}`;

    if (
      isAuthFailureStatus(response.status) &&
      isAuthFailureMessage(resolved)
    ) {
      if (!options?.skipSessionInvalidation) {
        await invalidateSession(resolved);
      }
      throw new ApiError(response.status, resolved);
    }

    throw new ApiError(response.status, resolved);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function fetchMe(
  token: string,
  options?: ApiFetchOptions,
): Promise<MeResponse> {
  return apiFetch<MeResponse>('/me', token, undefined, options);
}

export function updateProfile(
  token: string,
  userMetadata: UserMetadataPayload,
): Promise<MeResponse> {
  return apiFetch<MeResponse>('/me', token, {
    method: 'PATCH',
    body: JSON.stringify({ userMetadata }),
  });
}

export function fetchGithubOAuthUrl(
  token: string,
): Promise<{ authorizeUrl: string; state: string }> {
  return apiFetch('/github/oauth/url', token);
}

export function connectGithub(
  token: string,
  code: string,
): Promise<{ githubLogin: string; connected: boolean }> {
  return apiFetch('/github/connect', token, {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

export function fetchGithubRepos(token: string): Promise<GithubRepo[]> {
  return apiFetch('/github/repos', token);
}

/** Enqueues a background review job (HTTP 202). Poll with `fetchReport`. */
export function startReview(
  token: string,
  owner: string,
  repo: string,
): Promise<CodeReviewReport> {
  return apiFetch('/analysis/review', token, {
    method: 'POST',
    body: JSON.stringify({ owner, repo }),
  });
}

export function fetchReports(
  token: string,
  filter: ListReportsFilter = {},
): Promise<CodeReviewReportListItem[]> {
  const params = new URLSearchParams();
  if (filter.github?.trim()) {
    params.set('github', filter.github.trim());
  }
  if (filter.q?.trim()) {
    params.set('q', filter.q.trim());
  }
  if (filter.status) {
    params.set('status', filter.status);
  }
  if (filter.reviewEngine) {
    params.set('reviewEngine', filter.reviewEngine);
  }
  if (filter.sortBy) {
    params.set('sortBy', filter.sortBy);
  }
  if (filter.sortOrder) {
    params.set('sortOrder', filter.sortOrder);
  }
  const query = params.toString();
  const path = query ? `/analysis/reports?${query}` : '/analysis/reports';
  return apiFetch(path, token);
}

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 300_000;

export async function waitForReviewReport(
  token: string,
  reportId: string,
  onUpdate?: (report: CodeReviewReport) => void,
): Promise<CodeReviewReport> {
  const started = Date.now();

  for (;;) {
    const report = await fetchReport(token, reportId);
    onUpdate?.(report);

    if (isReviewFinished(report.status)) {
      return report;
    }

    if (Date.now() - started > POLL_TIMEOUT_MS) {
      throw new Error('Review timed out — check reports list later');
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

export function fetchReport(
  token: string,
  reportId: string,
): Promise<CodeReviewReport> {
  return apiFetch(`/analysis/reports/${reportId}`, token);
}
