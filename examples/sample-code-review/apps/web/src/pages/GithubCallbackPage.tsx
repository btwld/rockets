import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { connectGithub } from '../lib/api';
import { Alert } from '../components/ui/alert';
import { Card } from '../components/ui/card';
import { Spinner } from '../components/ui/spinner';
import {
  GITHUB_OAUTH_CODE_STORAGE_KEY,
  getIdToken,
  waitForAuthReady,
} from '../lib/firebase';

type Phase = 'restoring' | 'connecting' | 'done' | 'error';

export function GithubCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('restoring');

  useEffect(() => {
    const code = params.get('code');
    if (!code) {
      setPhase('error');
      setError('Missing ?code= from GitHub redirect');
      return;
    }

    void (async () => {
      try {
        setPhase('restoring');
        const user = await waitForAuthReady();

        if (!user) {
          sessionStorage.setItem(GITHUB_OAUTH_CODE_STORAGE_KEY, code);
          navigate('/login', {
            replace: true,
            state: {
              message:
                'Sign in with Firebase to finish linking your GitHub account.',
            },
          });
          return;
        }

        setPhase('connecting');
        const token = await getIdToken();
        await connectGithub(token, code);
        sessionStorage.removeItem(GITHUB_OAUTH_CODE_STORAGE_KEY);
        setPhase('done');
        navigate('/', { replace: true });
      } catch (err) {
        setPhase('error');
        setError(err instanceof Error ? err.message : 'GitHub connect failed');
      }
    })();
  }, [params, navigate]);

  const statusMessage =
    phase === 'restoring'
      ? 'Restoring Firebase session…'
      : phase === 'connecting'
        ? 'Linking GitHub to your account…'
        : phase === 'done'
          ? 'Connected — redirecting…'
          : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <Card className="w-full max-w-md">
        <h2 className="text-lg font-semibold text-slate-900">GitHub</h2>
        {error ? <Alert variant="error">{error}</Alert> : null}
        {statusMessage && !error ? (
          <div className="mt-4">
            <Spinner label={statusMessage} />
          </div>
        ) : null}
        <p className="mt-4 text-sm">
          <Link to="/">Back to dashboard</Link>
        </p>
      </Card>
    </div>
  );
}
