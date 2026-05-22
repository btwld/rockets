import { getAuth } from 'firebase-admin/auth';

export interface FirebaseAdminAuth {
  verifyIdToken(
    token: string,
    checkRevoked?: boolean,
  ): Promise<Record<string, unknown> & { uid: string }>;
}

interface FirebaseAdminAppLegacy {
  auth(): FirebaseAdminAuth;
}

/**
 * Legacy `admin.app.App` exposes `.auth()`; modular apps from
 * `firebase-admin/app` require `getAuth(app)` from `firebase-admin/auth`.
 */
export function resolveFirebaseAdminAuth(
  firebaseApp: unknown,
): FirebaseAdminAuth {
  const legacy = firebaseApp as FirebaseAdminAppLegacy;
  if (typeof legacy.auth === 'function') {
    return legacy.auth();
  }
  return getAuth(firebaseApp as Parameters<typeof getAuth>[0]);
}
