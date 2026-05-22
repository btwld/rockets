import { logout } from './firebase';

const DEFAULT_MESSAGE = 'Your session expired. Sign in again.';

let invalidating = false;
let listener: ((message: string) => void) | null = null;

export function onSessionInvalid(
  callback: (message: string) => void,
): () => void {
  listener = callback;
  return () => {
    if (listener === callback) {
      listener = null;
    }
  };
}

/**
 * Signs out Firebase and notifies the app router (or hard-redirects to login).
 */
export async function invalidateSession(apiMessage?: string): Promise<void> {
  if (invalidating) {
    return;
  }
  invalidating = true;
  try {
    await logout();
    const message = apiMessage?.trim() || DEFAULT_MESSAGE;
    if (listener) {
      listener(message);
      return;
    }
    const params = new URLSearchParams({ reason: 'session-expired' });
    window.location.assign(`/login?${params.toString()}`);
  } finally {
    invalidating = false;
  }
}
