import { FormEvent, useMemo, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { connectGithub, fetchMe } from '../lib/api';
import { isApiError } from '../lib/api-errors';
import { Alert } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import {
  GITHUB_OAUTH_CODE_STORAGE_KEY,
  getIdToken,
  login,
} from '../lib/firebase';

export function LoginPage() {
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const hint = useMemo(() => {
    if (searchParams.get('reason') === 'session-expired') {
      return 'Your session expired. Sign in again.';
    }
    const stateMsg = (location.state as { message?: string } | null)?.message;
    return typeof stateMsg === 'string' ? stateMsg : null;
  }, [location.state, searchParams]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      const token = await getIdToken();
      await fetchMe(token, { skipSessionInvalidation: true });

      const pendingGithubCode = sessionStorage.getItem(
        GITHUB_OAUTH_CODE_STORAGE_KEY,
      );
      if (pendingGithubCode) {
        try {
          await connectGithub(token, pendingGithubCode);
        } catch (githubErr) {
          sessionStorage.removeItem(GITHUB_OAUTH_CODE_STORAGE_KEY);
          if (!isApiError(githubErr) || githubErr.status !== 401) {
            throw githubErr;
          }
        }
        sessionStorage.removeItem(GITHUB_OAUTH_CODE_STORAGE_KEY);
      }

      window.location.assign('/');
    } catch (err) {
      if (isApiError(err) && err.status === 401) {
        setError(
          'Firebase login succeeded but the API rejected the token. ' +
            'Restart the API (port 3001) and confirm FIREBASE_PROJECT_ID matches the web app.',
        );
        return;
      }
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10 sm:px-6">
      <div className="app-orb pointer-events-none absolute left-[-5rem] top-14 h-56 w-56 rounded-full bg-[radial-gradient(circle,_rgba(198,125,50,0.32),_transparent_70%)] blur-3xl" />
      <div className="app-orb app-orb-delay pointer-events-none absolute right-[-4rem] bottom-8 h-64 w-64 rounded-full bg-[radial-gradient(circle,_rgba(15,118,110,0.22),_transparent_70%)] blur-3xl" />
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <p className="text-[0.72rem] font-bold uppercase tracking-[0.34em] text-[#8c5d2f]">
            Rockets SDK
          </p>
          <h1
            className="mt-3 text-4xl font-extrabold tracking-[-0.05em] text-slate-950"
            data-testid="login-title"
          >
            Sign in
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Use your Firebase email and password.
          </p>
        </div>

        <Card className="border-white/80 bg-[color:var(--app-card-strong)] p-5 sm:p-6">
          {hint ? <Alert variant="info">{hint}</Alert> : null}
          {error ? (
            <Alert variant="error" testId="login-error">
              {error}
            </Alert>
          ) : null}

          <form className="mt-5 space-y-4" onSubmit={onSubmit}>
            <Input
              label="Email"
              type="email"
              data-testid="login-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="you@company.com"
            />
            <Input
              label="Password"
              type="password"
              data-testid="login-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="••••••••"
            />
            <Button
              type="submit"
              className="mt-2 w-full"
              data-testid="login-submit"
              disabled={loading}
            >
              {loading ? 'Signing in…' : 'Enter'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
