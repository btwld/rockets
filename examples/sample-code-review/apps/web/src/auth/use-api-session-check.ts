import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { fetchMe } from '../lib/api';
import { isApiError } from '../lib/api-errors';
import { getIdToken } from '../lib/firebase';

interface ApiSessionCheckResult {
  readonly checked: boolean;
  readonly ok: boolean;
}

/**
 * Confirms that the current Firebase user is also accepted by the API.
 * A 401 keeps the session invalid so the caller can redirect/render login.
 */
export function useApiSessionCheck(
  ready: boolean,
  user: User | null,
): ApiSessionCheckResult {
  const [checked, setChecked] = useState(false);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    if (!ready || !user) {
      setChecked(false);
      setOk(false);
      return;
    }

    let cancelled = false;
    setChecked(false);

    void (async () => {
      try {
        const token = await getIdToken();
        await fetchMe(token);
        if (!cancelled) {
          setOk(true);
        }
      } catch (err) {
        if (cancelled) {
          return;
        }
        if (isApiError(err) && err.status === 401) {
          setOk(false);
        } else {
          setOk(true);
        }
      } finally {
        if (!cancelled) {
          setChecked(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, user?.uid]);

  return { checked, ok };
}
