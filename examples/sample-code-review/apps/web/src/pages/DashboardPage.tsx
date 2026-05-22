import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { ReviewProgressCard } from '../components/ReviewProgressCard';
import { Alert } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import {
  type CodeReviewEngine,
  fetchGithubOAuthUrl,
  fetchGithubRepos,
  fetchMe,
  fetchReports,
  isReviewFinished,
  startReview,
  type CodeReviewReportExecution,
  waitForReviewReport,
  type CodeReviewReport,
  type CodeReviewReportListItem,
  type CodeReviewReportSortField,
  type CodeReviewReportSortOrder,
  type CodeReviewReportStatus,
  type GithubRepo,
  type ListReportsFilter,
  type MeResponse,
  type UserMetadataView,
} from '../lib/api';
import { getIdToken, getIdTokenExpirationTime } from '../lib/firebase';

function profileDisplayName(me: MeResponse | null): string | null {
  const meta = me?.userMetadata as UserMetadataView | undefined;
  if (!meta?.firstName && !meta?.lastName) {
    return null;
  }
  return [meta.firstName, meta.lastName].filter(Boolean).join(' ').trim();
}

function statusLabel(status: string): string {
  switch (status) {
    case 'queued':
      return 'Queued';
    case 'fetching':
      return 'Fetching…';
    case 'analyzing':
      return 'Analyzing…';
    case 'completed':
      return 'Ready';
    case 'failed':
      return 'Failed';
    default:
      return status;
  }
}

function statusClass(status: string): string {
  if (status === 'completed') {
    return 'border-[rgba(5,150,105,0.16)] bg-[rgba(236,253,245,0.95)] text-emerald-950';
  }
  if (status === 'failed') {
    return 'border-[rgba(190,24,93,0.16)] bg-[rgba(255,241,242,0.95)] text-rose-950';
  }
  return 'border-[rgba(15,118,110,0.16)] bg-[rgba(240,253,250,0.95)] text-teal-950';
}

function buildReportListFilter(
  githubValue: string,
  queryValue: string,
  statusValue: CodeReviewReportStatus | '',
  reviewEngineValue: CodeReviewEngine | '',
  sortByValue: CodeReviewReportSortField,
  sortOrderValue: CodeReviewReportSortOrder,
): ListReportsFilter {
  const github = githubValue.trim();
  const q = queryValue.trim();

  return {
    ...(github ? { github } : {}),
    ...(q ? { q } : {}),
    ...(statusValue ? { status: statusValue } : {}),
    ...(reviewEngineValue ? { reviewEngine: reviewEngineValue } : {}),
    sortBy: sortByValue,
    sortOrder: sortOrderValue,
  };
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString();
}

function executionSummary(
  execution: CodeReviewReportExecution | undefined,
): string | null {
  if (!execution) {
    return null;
  }

  return [
    execution.defaultBranch,
    `${execution.sourceFilesCount} files`,
    formatDateTime(execution.dateCreated),
  ].join(' • ');
}

function sourceLabel(value: 'firebase-firestore' | 'sqlite-typeorm'): string {
  if (value === 'firebase-firestore') {
    return 'Firebase / Firestore';
  }
  return 'SQLite / TypeORM';
}

function formatRelativeExpiry(value: string | null): string {
  if (!value) {
    return 'Unknown';
  }

  const expiresAt = new Date(value);
  const diffMs = expiresAt.getTime() - Date.now();
  const diffMinutes = Math.max(0, Math.round(diffMs / 60000));
  const absMinutes = Math.abs(diffMinutes);

  if (absMinutes < 1) {
    return 'now';
  }
  if (absMinutes < 60) {
    return `${absMinutes}m`;
  }

  const hours = Math.floor(absMinutes / 60);
  const minutes = absMinutes % 60;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

const fieldClass =
  'mt-2.5 w-full rounded-[1.15rem] border border-[color:var(--app-field-border)] bg-[color:var(--app-field)] px-4 py-3 text-sm text-slate-900 shadow-[0_1px_0_rgba(255,255,255,0.9),0_10px_18px_-14px_rgba(23,32,51,0.34)] transition placeholder:text-slate-400 focus:border-[rgba(15,118,110,0.55)] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[rgba(15,118,110,0.14)]';

const fieldLabelClass =
  'block text-[0.78rem] font-semibold uppercase tracking-[0.18em] text-slate-500';

export function DashboardPage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [repos, setRepos] = useState<GithubRepo[]>([]);
  const [reports, setReports] = useState<CodeReviewReportListItem[]>([]);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [githubLogin, setGithubLogin] = useState<string | null>(null);
  const [activeReview, setActiveReview] = useState<CodeReviewReport | null>(
    null,
  );
  const [tokenExpiresAt, setTokenExpiresAt] = useState<string | null>(null);
  const [reportFilterGithub, setReportFilterGithub] = useState('');
  const [reportFilterQ, setReportFilterQ] = useState('');
  const [reportFilterStatus, setReportFilterStatus] = useState<
    CodeReviewReportStatus | ''
  >('');
  const [reportFilterReviewEngine, setReportFilterReviewEngine] = useState<
    CodeReviewEngine | ''
  >('');
  const [reportSortBy, setReportSortBy] =
    useState<CodeReviewReportSortField>('dateCreated');
  const [reportSortOrder, setReportSortOrder] =
    useState<CodeReviewReportSortOrder>('desc');
  const [appliedReportFilter, setAppliedReportFilter] =
    useState<ListReportsFilter>({
      sortBy: 'dateCreated',
      sortOrder: 'desc',
    });
  const pollAbort = useRef(false);

  const loadReports = useCallback(async () => {
    const token = await getIdToken();
    setReports(await fetchReports(token, appliedReportFilter));
  }, [appliedReportFilter]);

  const loadDashboard = useCallback(async () => {
    const token = await getIdToken();
    setMe(await fetchMe(token));
    setTokenExpiresAt(await getIdTokenExpirationTime());
    try {
      const list = await fetchGithubRepos(token);
      setRepos(list);
      setGithubLogin('connected');
      if (list.length > 0 && !selected) {
        setSelected(list[0].fullName);
      }
    } catch {
      setGithubLogin(null);
      setRepos([]);
    }
  }, [selected]);

  useEffect(() => {
    void loadDashboard().catch((err) => {
      setError(err instanceof Error ? err.message : 'Failed to load');
    });
  }, [loadDashboard]);

  useEffect(() => {
    void loadReports().catch((err) => {
      setError(err instanceof Error ? err.message : 'Failed to load');
    });
  }, [loadReports]);

  useEffect(() => {
    return () => {
      pollAbort.current = true;
    };
  }, []);

  async function onConnectGithub() {
    setError(null);
    setBusy(true);
    try {
      const token = await getIdToken();
      const { authorizeUrl } = await fetchGithubOAuthUrl(token);
      window.location.href = authorizeUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OAuth start failed');
      setBusy(false);
    }
  }

  async function onRunReview() {
    const repo = repos.find((r) => r.fullName === selected);
    if (!repo) return;
    setError(null);
    setBusy(true);
    pollAbort.current = false;

    try {
      const token = await getIdToken();
      const queued = await startReview(token, repo.owner, repo.name);
      setActiveReview(queued);

      const finished = await waitForReviewReport(
        token,
        queued.id,
        (update) => {
          if (!pollAbort.current) {
            setActiveReview(update);
          }
        },
      );

      if (!pollAbort.current) {
        setActiveReview(finished);
        await loadReports();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Review failed');
    } finally {
      setBusy(false);
    }
  }

  function onApplyReportFilters() {
    setAppliedReportFilter(
      buildReportListFilter(
        reportFilterGithub,
        reportFilterQ,
        reportFilterStatus,
        reportFilterReviewEngine,
        reportSortBy,
        reportSortOrder,
      ),
    );
  }

  function onSubmitReportFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onApplyReportFilters();
  }

  const displayName = profileDisplayName(me);
  const reviewRunning =
    busy || (activeReview !== null && !isReviewFinished(activeReview.status));
  const selectedRepo = repos.find((repo) => repo.fullName === selected);

  return (
    <AppShell
      title="Code Review"
      titleTestId="dashboard-title"
      subtitle="Connect GitHub, run a review, inspect reports."
    >
      {error ? (
        <Alert variant="error" testId="dashboard-error">
          {error}
        </Alert>
      ) : null}

      {activeReview ? (
        <ReviewProgressCard
          report={activeReview}
          onDismiss={
            isReviewFinished(activeReview.status)
              ? () => setActiveReview(null)
              : undefined
          }
        />
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <Card className="bg-[color:var(--app-card-strong)]">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-bold tracking-[-0.03em] text-slate-950">
              Account
            </h2>
            <span className="rounded-full border border-white/80 bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
              {githubLogin ? 'GitHub connected' : 'GitHub missing'}
            </span>
          </div>

          <dl className="mt-5 space-y-4 text-sm">
            <div className="flex items-start justify-between gap-4 border-b border-[color:var(--app-line)] pb-4">
              <dt className="text-slate-500">Firebase</dt>
              <dd className="text-right font-semibold text-slate-950" data-testid="dashboard-firebase-email">
                {me?.email ?? me?.id ?? '…'}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4 border-b border-[color:var(--app-line)] pb-4">
              <dt className="text-slate-500">Profile</dt>
              <dd className="text-right text-slate-700">
                {displayName ? (
                  <strong data-testid="dashboard-profile-name">{displayName}</strong>
                ) : (
                  <Link to="/profile">Complete profile</Link>
                )}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="text-slate-500">Repos</dt>
              <dd className="text-right font-semibold text-slate-950">
                {githubLogin ? repos.length : 0}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4 border-t border-[color:var(--app-line)] pt-4">
              <dt className="text-slate-500">Token expires</dt>
              <dd className="text-right">
                <div className="font-semibold text-slate-950">
                  {tokenExpiresAt ? new Date(tokenExpiresAt).toLocaleString() : 'Loading…'}
                </div>
                <div className="text-xs text-slate-500">
                  In {formatRelativeExpiry(tokenExpiresAt)}
                </div>
              </dd>
            </div>
          </dl>

          <div className="mt-6 flex flex-wrap gap-3">
            {!githubLogin ? (
              <Button type="button" disabled={busy} onClick={() => void onConnectGithub()}>
                Connect GitHub
              </Button>
            ) : (
              <Button
                variant="secondary"
                type="button"
                disabled={reviewRunning}
                onClick={() => void loadDashboard()}
              >
                Refresh repos
              </Button>
            )}
            <Link to="/profile">
              <Button variant="ghost" type="button">
                Edit profile
              </Button>
            </Link>
          </div>
        </Card>

        <Card className="bg-[color:var(--app-card-strong)]">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-bold tracking-[-0.03em] text-slate-950">
              Run review
            </h2>
            <span className="rounded-full border border-[rgba(15,118,110,0.16)] bg-[rgba(240,253,250,0.95)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-teal-950">
              {reviewRunning ? 'Running' : 'Ready'}
            </span>
          </div>

          {githubLogin ? (
            <>
              <label className={`${fieldLabelClass} mt-5`}>
                Repository
                <select
                  className={fieldClass}
                  value={selected}
                  disabled={reviewRunning}
                  onChange={(e) => setSelected(e.target.value)}
                >
                  {repos.map((r) => (
                    <option key={r.fullName} value={r.fullName}>
                      {r.fullName}
                      {r.private ? ' (private)' : ''}
                    </option>
                  ))}
                </select>
              </label>

              {selectedRepo ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="rounded-full border border-white/80 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                    {selectedRepo.defaultBranch}
                  </span>
                  {selectedRepo.language ? (
                    <span className="rounded-full border border-white/80 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                      {selectedRepo.language}
                    </span>
                  ) : null}
                  <span className="rounded-full border border-white/80 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                    {selectedRepo.private ? 'Private' : 'Public'}
                  </span>
                </div>
              ) : null}

              <Button
                className="mt-6"
                type="button"
                data-testid="run-review-submit"
                disabled={reviewRunning || !selected}
                onClick={() => void onRunReview()}
              >
                {reviewRunning ? 'Review in progress…' : 'Run code review'}
              </Button>
            </>
          ) : (
            <div className="mt-5 rounded-[1.2rem] border border-dashed border-[rgba(23,32,51,0.16)] bg-white/55 px-4 py-5 text-sm text-slate-600">
              Connect GitHub to choose a repository and start the review.
            </div>
          )}
        </Card>
      </section>

      <Card className="bg-[color:var(--app-card-strong)]">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold tracking-[-0.03em] text-slate-950">
              Reports
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Firestore fields and SQLite fields are labeled below.
            </p>
          </div>
          <span className="rounded-full border border-white/80 bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
            {reports.length} items
          </span>
        </div>

        <form
          className="mt-6 rounded-[1.5rem] border border-white/80 bg-[rgba(255,251,245,0.8)] p-4 sm:p-5"
          onSubmit={onSubmitReportFilters}
        >
          <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            <label className={fieldLabelClass}>
              GitHub repo (Firestore)
              <input
                type="text"
                className={fieldClass}
                placeholder="btwld/rockets"
                value={reportFilterGithub}
                data-testid="reports-filter-github"
                onChange={(e) => setReportFilterGithub(e.target.value)}
              />
            </label>
            <label className={fieldLabelClass}>
              Search summary (Firestore)
              <input
                type="text"
                className={fieldClass}
                placeholder="title or summary"
                value={reportFilterQ}
                data-testid="reports-filter-q"
                onChange={(e) => setReportFilterQ(e.target.value)}
              />
            </label>
            <label className={fieldLabelClass}>
              Status (Firestore)
              <select
                className={fieldClass}
                value={reportFilterStatus}
                data-testid="reports-filter-status"
                onChange={(e) =>
                  setReportFilterStatus(e.target.value as CodeReviewReportStatus | '')
                }
              >
                <option value="">All</option>
                <option value="queued">Queued</option>
                <option value="fetching">Fetching</option>
                <option value="analyzing">Analyzing</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
              </select>
            </label>
            <label className={fieldLabelClass}>
              Engine (SQLite / TypeORM)
              <select
                className={fieldClass}
                value={reportFilterReviewEngine}
                data-testid="reports-filter-review-engine"
                onChange={(e) =>
                  setReportFilterReviewEngine(e.target.value as CodeReviewEngine | '')
                }
              >
                <option value="">All</option>
                <option value="heuristic">Heuristic</option>
                <option value="openai">OpenAI</option>
              </select>
            </label>
            <label className={fieldLabelClass}>
              Sort by
              <select
                className={fieldClass}
                value={reportSortBy}
                data-testid="reports-sort-by"
                onChange={(e) =>
                  setReportSortBy(e.target.value as CodeReviewReportSortField)
                }
              >
                <option value="dateCreated">Report created (Firestore)</option>
                <option value="executionDateCreated">
                  Execution created (SQLite / TypeORM)
                </option>
              </select>
            </label>
            <label className={fieldLabelClass}>
              Sort order
              <select
                className={fieldClass}
                value={reportSortOrder}
                data-testid="reports-sort-order"
                onChange={(e) =>
                  setReportSortOrder(e.target.value as CodeReviewReportSortOrder)
                }
              >
                <option value="desc">Newest first</option>
                <option value="asc">Oldest first</option>
              </select>
            </label>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button
              variant="secondary"
              type="submit"
              data-testid="reports-filter-apply"
            >
              Apply filters
            </Button>
            <Button variant="ghost" type="button" onClick={() => void loadReports()}>
              Refresh
            </Button>
          </div>
        </form>

        {reports.length === 0 ? (
          <div className="mt-6 rounded-[1.4rem] border border-dashed border-[rgba(23,32,51,0.16)] bg-white/55 px-5 py-8 text-center">
            <p className="text-sm text-slate-600">No reports found.</p>
          </div>
        ) : (
          <ul className="mt-6 space-y-4 text-sm">
            {reports.map((r) => (
              <li
                key={r.id}
                className="rounded-[1.5rem] border border-white/80 bg-[rgba(255,255,255,0.72)] px-5 py-5 shadow-[0_18px_38px_-32px_rgba(23,32,51,0.35)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {r.status === 'completed' ? (
                        <Link
                          to={`/reports/${r.id}`}
                          className="text-lg font-bold tracking-[-0.03em]"
                          data-testid={`report-link-${r.id}`}
                        >
                          {r.fullName}
                        </Link>
                      ) : (
                        <span className="text-lg font-bold tracking-[-0.03em] text-slate-900">
                          {r.fullName}
                        </span>
                      )}
                      <span
                        className={`rounded-full border px-3 py-1 text-[0.68rem] font-bold uppercase tracking-[0.2em] ${statusClass(r.status)}`}
                      >
                        {statusLabel(r.status)}
                      </span>
                    </div>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                      {r.summary}
                    </p>
                  </div>
                  <div className="rounded-full border border-white/80 bg-white/80 px-3 py-1 text-[0.68rem] font-bold uppercase tracking-[0.2em] text-slate-500">
                    {formatDateTime(r.dateCreated)}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="rounded-full border border-[rgba(15,118,110,0.18)] bg-[rgba(15,118,110,0.08)] px-3 py-1 text-[0.68rem] font-bold uppercase tracking-[0.2em] text-[#115e59]">
                    Report: {sourceLabel(r.persistence.reportDocument)}
                  </span>
                  {r.execution?.reviewEngine ? (
                    <span className="rounded-full border border-[rgba(15,118,110,0.18)] bg-[rgba(15,118,110,0.08)] px-3 py-1 text-[0.68rem] font-bold uppercase tracking-[0.2em] text-[#115e59]">
                      {r.execution.reviewEngine}
                    </span>
                  ) : null}
                  {r.persistence.executionRecord ? (
                    <span className="rounded-full border border-white/80 bg-white px-3 py-1 text-[0.68rem] font-bold uppercase tracking-[0.2em] text-slate-500">
                      Execution: {sourceLabel(r.persistence.executionRecord)}
                    </span>
                  ) : null}
                  {r.execution?.defaultBranch ? (
                    <span className="rounded-full border border-white/80 bg-white px-3 py-1 text-[0.68rem] font-bold uppercase tracking-[0.2em] text-slate-500">
                      Branch: {r.execution.defaultBranch}
                    </span>
                  ) : null}
                  {typeof r.execution?.sourceFilesCount === 'number' ? (
                    <span className="rounded-full border border-white/80 bg-white px-3 py-1 text-[0.68rem] font-bold uppercase tracking-[0.2em] text-slate-500">
                      Files: {r.execution.sourceFilesCount}
                    </span>
                  ) : null}
                </div>

                {executionSummary(r.execution) ? (
                  <p className="mt-4 text-xs leading-6 text-slate-500">
                    {executionSummary(r.execution)}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="text-sm text-slate-500">
        API docs:{' '}
        <a
          href={`${import.meta.env.VITE_API_URL ?? 'http://localhost:3001'}/api`}
          target="_blank"
          rel="noreferrer"
        >
          Swagger
        </a>
      </p>
    </AppShell>
  );
}
