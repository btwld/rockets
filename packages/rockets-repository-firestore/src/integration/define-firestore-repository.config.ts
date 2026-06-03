import type { FirestoreBackend } from '../interfaces/firestore-backend.interface';

/**
 * Optional override when constructing a Firestore {@link RepositoryBootstrap}.
 *
 * Production apps omit this object entirely. Firebase Admin must be
 * initialized centrally (e.g. `defineFirebaseAuth` / `ensureFirebaseAdminApp`)
 * before Rockets registers repositories.
 */
export interface DefineFirestoreRepositoryOptions {
  readonly backend?: FirestoreBackend;
}
