import { existsSync, readFileSync } from 'fs';
import { isAbsolute, resolve } from 'path';
import {
  cert,
  getApp,
  getApps,
  initializeApp,
  type App,
  type ServiceAccount,
} from 'firebase-admin/app';

function resolveServiceAccountPath(configured: string, packageRoot: string): string {
  if (isAbsolute(configured)) {
    return configured;
  }
  return resolve(packageRoot, configured.replace(/^\.\//, ''));
}

function readServiceAccount(packageRoot: string): ServiceAccount | undefined {
  const configured =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim() ??
    process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();

  if (!configured) {
    return undefined;
  }

  const absolute = resolveServiceAccountPath(configured, packageRoot);
  if (!existsSync(absolute)) {
    return undefined;
  }

  return JSON.parse(readFileSync(absolute, 'utf8')) as ServiceAccount;
}

function projectIdFromAccount(account: ServiceAccount): string | undefined {
  if (typeof account.projectId === 'string') {
    return account.projectId;
  }
  const legacy = account as ServiceAccount & { readonly project_id?: string };
  return typeof legacy.project_id === 'string' ? legacy.project_id : undefined;
}

/** Singleton Admin app for Firestore repositories (shared with auth adapter). */
export function ensureFirebaseAdminApp(packageRoot: string): App {
  if (getApps().length > 0) {
    return getApp();
  }

  const serviceAccount = readServiceAccount(packageRoot);
  if (serviceAccount) {
    return initializeApp({
      credential: cert(serviceAccount),
      projectId: projectIdFromAccount(serviceAccount),
    });
  }

  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  if (!projectId) {
    throw new Error(
      'Firebase Admin: set FIREBASE_PROJECT_ID or FIREBASE_SERVICE_ACCOUNT_PATH ' +
        '(or GOOGLE_APPLICATION_CREDENTIALS) relative to the app package root.',
    );
  }

  return initializeApp({ projectId });
}
