export { FirestoreRepositoryModule } from './firestore-repository.module';
export {
  FirestoreRepository,
  isFirestoreRepository,
} from './repository/firestore-repository';
export type { FirestoreProviderOptions } from './interfaces/firestore-provider-options.interface';
export { FIRESTORE_REPOSITORY_MODULE_NAME } from './constants/firestore-repository.constants';
export {
  FIRESTORE_ALT_SOFT_DELETE_FIELD,
  FIRESTORE_DEFAULT_SOFT_DELETE_FIELD,
} from './constants/firestore-soft-delete.constants';
export { ensureFirebaseAdminApp } from './utils/ensure-firebase-admin-app';
export {
  registerFirestoreCollection,
  resolveFirestoreCollection,
} from './utils/firestore-collection.registry';
