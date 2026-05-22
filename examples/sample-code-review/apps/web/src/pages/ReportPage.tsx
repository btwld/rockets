import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { ReviewProgressCard } from '../components/ReviewProgressCard';
import { Alert } from '../components/ui/alert';
import { Card } from '../components/ui/card';
import { Spinner } from '../components/ui/spinner';
import {
  fetchReport,
  isReviewFinished,
  waitForReviewReport,
  type CodeReviewReport,
  type CodeReviewSectionScore,
} from '../lib/api';
import { getIdToken } from '../lib/firebase';

const severityBorder: Record<string, string> = {
  critical:
    'border-[rgba(190,24,93,0.18)] bg-[rgba(255,241,242,0.92)] text-rose-950',
  warning:
    'border-[rgba(217,119,6,0.16)] bg-[rgba(255,251,235,0.92)] text-amber-950',
  info: 'border-[rgba(8,145,178,0.16)] bg-[rgba(236,254,255,0.92)] text-cyan-950',
};

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return 'Pending';
  }
  return new Date(value).toLocaleString();
}

const sectionLabel: Record<CodeReviewSectionScore['section'], string> = {
  architecture: 'Architecture',
  security: 'Security',
  bestPractices: 'Best Practices',
  maintainability: 'Maintainability',
  testing: 'Testing',
};

function scoreTone(score: number): string {
  if (score >= 8) {
    return 'border-[rgba(5,150,105,0.16)] bg-[rgba(236,253,245,0.92)] text-emerald-950';
  }
  if (score >= 6) {
    return 'border-[rgba(217,119,6,0.16)] bg-[rgba(255,251,235,0.92)] text-amber-950';
  }
  return 'border-[rgba(190,24,93,0.16)] bg-[rgba(255,241,242,0.92)] text-rose-950';
}

function averageScore(scorecard: readonly CodeReviewSectionScore[]): string {
  if (scorecard.length === 0) {
    return '0.0';
  }
  const total = scorecard.reduce((sum, item) => sum + item.score, 0);
  return (total / scorecard.length).toFixed(1);
}

function sourceLabel(value: 'firebase-firestore' | 'sqlite-typeorm'): string {
  if (value === 'firebase-firestore') {
    return 'Firebase / Firestore';
  }
  return 'SQLite / TypeORM';
}

export function ReportPage() {
  const { reportId } = useParams<{ reportId: string }>();
  const [report, setReport] = useState<CodeReviewReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!reportId) return;

    let cancelled = false;

    void (async () => {
      try {
        const token = await getIdToken();
        const initial = await fetchReport(token, reportId);
        if (cancelled) return;

        if (!isReviewFinished(initial.status)) {
          setReport(initial);
          setLoading(false);
          const finished = await waitForReviewReport(
            token,
            reportId,
            (update) => {
              if (!cancelled) {
                setReport(update);
              }
            },
          );
          if (!cancelled) {
            setReport(finished);
          }
          return;
        }

        setReport(initial);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load report');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [reportId]);

  const inProgress = report !== null && !isReviewFinished(report.status);

  return (
    <AppShell
      title="Report"
      subtitle="Review details and findings."
    >
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
        <Link to="/">Back to dashboard</Link>
      </p>
      {error ? <Alert variant="error">{error}</Alert> : null}
      {loading ? <Spinner label="Loading report…" /> : null}
      {inProgress ? <ReviewProgressCard report={report} /> : null}
      {report && report.status === 'completed' ? (
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <Card className="bg-[color:var(--app-card-strong)]">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[0.72rem] font-bold uppercase tracking-[0.34em] text-[#8c5d2f]">
                  Completed analysis
                </p>
                <h2 className="mt-3 text-3xl font-extrabold tracking-[-0.05em] text-slate-950">
                  {report.fullName}
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                  {report.summary}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="rounded-full border border-[rgba(15,118,110,0.18)] bg-[rgba(15,118,110,0.08)] px-3 py-1 text-[0.68rem] font-bold uppercase tracking-[0.2em] text-[#115e59]">
                    Report data: {sourceLabel(report.persistence.reportDocument)}
                  </span>
                  {report.persistence.executionRecord ? (
                    <span className="rounded-full border border-white/80 bg-white px-3 py-1 text-[0.68rem] font-bold uppercase tracking-[0.2em] text-slate-500">
                      Execution data: {sourceLabel(report.persistence.executionRecord)}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="space-y-2">
                <div className="rounded-full border border-[rgba(15,118,110,0.18)] bg-[rgba(15,118,110,0.08)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#115e59]">
                  Overall {averageScore(report.scorecard ?? [])} / 10
                </div>
                <div className="rounded-full border border-white/80 bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
                  {report.findings.length} finding{report.findings.length === 1 ? '' : 's'}
                </div>
              </div>
            </div>

            <h3 className="mt-8 text-lg font-semibold text-slate-950">
              Scorecard
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Stored in the Firestore report document.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {(report.scorecard ?? []).map((item) => (
                <div
                  key={item.section}
                  className={`rounded-[1.3rem] border px-4 py-4 ${scoreTone(item.score)}`}
                >
                  <div className="flex items-end justify-between gap-3">
                    <p className="text-sm font-semibold">{sectionLabel[item.section]}</p>
                    <p className="text-2xl font-extrabold tracking-[-0.04em]">
                      {item.score}
                      <span className="text-sm font-semibold">/10</span>
                    </p>
                  </div>
                  <p className="mt-3 text-sm leading-6">{item.summary}</p>
                </div>
              ))}
            </div>

            <h3 className="mt-8 text-lg font-semibold text-slate-950">Findings</h3>
            <p className="mt-1 text-sm text-slate-500">
              Stored in the Firestore report document.
            </p>
            <div className="mt-4 space-y-3">
              {report.findings.map((f, i) => (
                <div
                  key={i}
                  className={`rounded-[1.3rem] border px-4 py-4 ${severityBorder[f.severity] ?? 'border-white/70 bg-white/70 text-slate-900'}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-white/80 px-3 py-1 text-[0.68rem] font-bold uppercase tracking-[0.22em]">
                      {f.severity}
                    </span>
                    <strong className="text-sm">
                      {f.file}
                      {f.line ? `:${f.line}` : ''}
                    </strong>
                  </div>
                  <p className="mt-3 text-sm leading-6">{f.message}</p>
                  {f.suggestion ? (
                    <p className="mt-3 text-sm italic text-slate-600">{f.suggestion}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </Card>

          <div className="space-y-6">
            <Card className="bg-[linear-gradient(150deg,rgba(23,32,51,0.95),rgba(36,53,77,0.9))] text-white">
              <p className="text-[0.72rem] font-bold uppercase tracking-[0.34em] text-[#8dd6cf]">
                Execution metadata
              </p>
              <p className="mt-1 text-sm text-slate-300">
                Stored in the SQLite / TypeORM execution record.
              </p>
              <dl className="mt-5 space-y-3 text-sm text-slate-200">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-300">Engine</dt>
                  <dd className="font-semibold text-white">
                    {report.execution?.reviewEngine ?? 'Pending'}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-300">Model</dt>
                  <dd className="font-semibold text-white">
                    {report.execution?.reviewModel ?? 'Heuristic'}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-300">Branch</dt>
                  <dd className="font-semibold text-white">
                    {report.execution?.defaultBranch ?? 'main'}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-300">Files</dt>
                  <dd className="font-semibold text-white">
                    {report.execution?.sourceFilesCount ?? 0}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-300">Duration</dt>
                  <dd className="font-semibold text-white">
                    {report.execution?.durationMs
                      ? `${report.execution.durationMs} ms`
                      : 'Pending'}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-300">Execution created</dt>
                  <dd className="text-right font-semibold text-white">
                    {formatDateTime(report.execution?.dateCreated)}
                  </dd>
                </div>
              </dl>
            </Card>

            <Card>
              <p className="text-[0.72rem] font-bold uppercase tracking-[0.34em] text-[#8c5d2f]">
                Prompt used
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Stored in the Firestore report document.
              </p>
              <pre className="mt-4 max-h-[26rem] overflow-auto whitespace-pre-wrap rounded-[1.3rem] border border-white/80 bg-white/70 p-4 text-xs leading-6 text-slate-700">
                {report.promptUsed}
              </pre>
            </Card>
          </div>
        </div>
      ) : null}
      {report && report.status === 'failed' ? (
        <Alert variant="error">{report.summary}</Alert>
      ) : null}
    </AppShell>
  );
}
