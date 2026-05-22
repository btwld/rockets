import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Spinner } from '../components/ui/spinner';
import { useAuth } from './auth-context';
import { useApiSessionCheck } from './use-api-session-check';

interface AuthGuardProps {
  readonly children: ReactNode;
}

/**
 * Route guard: requires Firebase session and a valid Rockets bearer (GET /me).
 * On 401 from the API, `api.ts` signs out and redirects via `invalidateSession`.
 */
export function AuthGuard({ children }: AuthGuardProps) {
  const { user, ready } = useAuth();
  const location = useLocation();
  const { checked: apiChecked, ok: apiOk } = useApiSessionCheck(ready, user);

  if (!ready || (user && !apiChecked)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Spinner label="Checking session…" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (!apiOk && apiChecked) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
