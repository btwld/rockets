import type { PlainLiteralObject, Type } from '@nestjs/common';

import type { FirestoreBackend } from './firestore-backend.interface';

/**
 * Optional wiring for {@link FirestoreRepositoryModule.forFeature}.
 *
 * Production apps omit this — Firebase Admin must already be initialized.
 * Tests may pass an explicit in-memory backend.
 */
export interface FirestoreRepositoryModuleOptions {
  readonly backend?: FirestoreBackend;
}

/**
 * Options for {@link FirestoreRepositoryModule.forRoot} — same shape as
 * `TypeOrmModule.forRoot({ ...connection, entities })`.
 */
export interface FirestoreRepositoryRootOptions
  extends FirestoreRepositoryModuleOptions {
  readonly entities: ReadonlyArray<Type<PlainLiteralObject>>;
}
