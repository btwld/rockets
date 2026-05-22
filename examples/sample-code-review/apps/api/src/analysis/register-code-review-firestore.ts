import { existsSync } from 'fs';
import { isAbsolute, resolve } from 'path';
import { Logger } from '@nestjs/common';
import { deriveEntityKey } from '@bitwild/rockets-common';
import { registerFirestoreCollection } from '@bitwild/rockets-repository-firestore';

import { createFirebaseAdminApp } from '../auth-firebase/create-firebase-admin-app';
import { CodeReviewReportEntity } from './code-review-report.entity';

const logger = new Logger('CodeReviewFirestore');

/** `apps/api` root — same base as `create-firebase-admin-app.ts`. */
const API_PACKAGE_ROOT = resolve(__dirname, '..', '..');

function resolveServiceAccountAbsolutePath(): string | undefined {
  const configured =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim() ??
    './secrets/firebase-service-account.json';
  const absolute = resolve(
    API_PACKAGE_ROOT,
    configured.replace(/^\.\//, ''),
  );
  return existsSync(absolute) ? absolute : undefined;
}

function hasGoogleApplicationCredentials(): boolean {
  const configured = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (!configured) {
    return false;
  }
  const absolute = isAbsolute(configured)
    ? configured
    : resolve(API_PACKAGE_ROOT, configured.replace(/^\.\//, ''));
  return existsSync(absolute);
}

/**
 * Firestore needs a service account (Auth can run with projectId only).
 * Without a JSON key, use in-memory reports for local dev.
 */
if (
  process.env.FIREBASE_FIRESTORE_USE_FAKE !== 'true' &&
  !resolveServiceAccountAbsolutePath() &&
  !hasGoogleApplicationCredentials()
) {
  process.env.FIREBASE_FIRESTORE_USE_FAKE = 'true';
  logger.warn(
    'No Firebase service account — reports use in-memory Firestore. ' +
      'Add apps/api/secrets/firebase-service-account.json (and set ' +
      'FIREBASE_SERVICE_ACCOUNT_PATH) for real Firestore.',
  );
}

if (process.env.FIREBASE_FIRESTORE_USE_FAKE !== 'true') {
  createFirebaseAdminApp();
}

const collection =
  process.env.FIREBASE_FIRESTORE_REPORTS_COLLECTION?.trim() ??
  'code_review_reports';

registerFirestoreCollection(deriveEntityKey(CodeReviewReportEntity), collection);

export const CODE_REVIEW_REPORT_COLLECTION = collection;
