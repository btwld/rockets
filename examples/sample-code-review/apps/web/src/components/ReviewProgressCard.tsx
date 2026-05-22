import { Link } from 'react-router-dom';
import { isReviewFinished, type CodeReviewReport } from '../lib/api';
import { Alert } from './ui/alert';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Spinner } from './ui/spinner';

const STEP_LABELS: Record<string, string> = {
  queued: 'Queued',
  fetching: 'Fetching from GitHub',
  analyzing: 'AI review',
  completed: 'Done',
  failed: 'Failed',
};

interface ReviewProgressCardProps {
  readonly report: CodeReviewReport;
  readonly onDismiss?: () => void;
}

export function ReviewProgressCard({
  report,
  onDismiss,
}: ReviewProgressCardProps) {
  const finished = isReviewFinished(report.status);
  const failed = report.status === 'failed';

  return (
    <Card
      className="overflow-hidden border-[rgba(15,118,110,0.16)] bg-[linear-gradient(135deg,rgba(237,252,249,0.92),rgba(255,249,240,0.88))]"
      data-testid="review-progress-card"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-xl">
          <p className="text-[0.7rem] font-bold uppercase tracking-[0.28em] text-[#8c5d2f]">
            Live pipeline
          </p>
          <h2 className="mt-2 text-xl font-bold tracking-[-0.03em] text-slate-950">
            {finished ? 'Review finished' : 'Review in progress'}
          </h2>
          <p className="mt-2 text-sm text-slate-600">{report.fullName}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full border border-white/80 bg-white/75 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
            {STEP_LABELS[report.status]}
          </span>
          {!finished ? <Spinner label="" className="scale-75" /> : null}
        </div>
      </div>

      <ol className="mt-6 grid gap-3 sm:grid-cols-3">
        {(['queued', 'fetching', 'analyzing'] as const).map((step, index) => {
          const active = report.status === step;
          const stepOrder = ['queued', 'fetching', 'analyzing', 'completed'];
          const currentIndex = stepOrder.indexOf(report.status);
          const done =
            report.status === 'completed' ||
            (report.status === 'failed' && index < 2) ||
            (currentIndex > index && currentIndex >= 0);

          return (
            <li
              key={step}
              className={`rounded-[1.2rem] border px-4 py-3 text-sm ${
                active
                  ? 'border-[rgba(15,118,110,0.26)] bg-white text-[#115e59]'
                  : done
                    ? 'border-[rgba(5,150,105,0.18)] bg-[rgba(236,253,245,0.7)] text-emerald-900'
                    : 'border-white/65 bg-white/55 text-slate-500'
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                    done
                      ? 'bg-emerald-600 text-white'
                      : active
                        ? 'bg-[color:var(--app-accent)] text-white'
                        : 'bg-slate-200 text-slate-500'
                  }`}
                >
                  {done ? '✓' : active ? '…' : index + 1}
                </span>
                <span className="font-semibold">{STEP_LABELS[step]}</span>
              </div>
            </li>
          );
        })}
      </ol>

      {report.progressMessage ? (
        <p
          className="mt-4 rounded-[1.15rem] border border-white/75 bg-white/60 px-4 py-3 text-sm text-slate-600"
          data-testid="review-progress-message"
        >
          {report.progressMessage}
        </p>
      ) : null}

      {failed ? (
        <Alert variant="error" testId="review-progress-error">
          {report.summary}
        </Alert>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-2">
        {report.status === 'completed' ? (
          <Link to={`/reports/${report.id}`}>
            <Button type="button" data-testid="review-view-report">
              View report
            </Button>
          </Link>
        ) : null}
        {onDismiss ? (
          <Button variant="secondary" type="button" onClick={onDismiss}>
            Dismiss
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
