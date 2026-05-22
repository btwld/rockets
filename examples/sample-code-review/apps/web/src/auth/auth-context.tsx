import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import type { User } from 'firebase/auth';
import { onSessionInvalid } from '../lib/session';
import { logout, watchAuth } from '../lib/firebase';

interface AuthContextValue {
  readonly user: User | null;
  readonly ready: boolean;
  readonly signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { readonly children: ReactNode }) {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => watchAuth((next) => {
    setUser(next);
    setReady(true);
  }), []);

  useEffect(() => {
    return onSessionInvalid((message) => {
      navigate('/login', {
        replace: true,
        state: { message },
      });
    });
  }, [navigate]);

  const signOut = useCallback(async () => {
    await logout();
    navigate('/login', { replace: true });
  }, [navigate]);

  const value = useMemo(
    () => ({ user, ready, signOut }),
    [user, ready, signOut],
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
