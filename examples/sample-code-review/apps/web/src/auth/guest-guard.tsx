import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { Spinner } from '../components/ui/spinner';
import { useAuth } from './auth-context';
import { useApiSessionCheck } from './use-api-session-check';

interface GuestGuardProps {
  readonly children: ReactNode;
}

/** Public routes (login): redirect authenticated users to the app. */
export function GuestGuard({ children }: GuestGuardProps) {
  const { user, ready } = useAuth();
  const { checked: apiChecked, ok: apiOk } = useApiSessionCheck(ready, user);

  if (!ready || (user && !apiChecked)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <Spinner label="Checking session…" className="text-slate-300" />
      </div>
    );
  }

  if (user && apiOk) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
