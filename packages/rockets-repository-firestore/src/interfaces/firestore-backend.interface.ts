import type {
  FirestoreOrderBy,
  FirestoreQueryBranch,
  FirestoreQueryFilter,
  FirestoreQueryPagePosition,
} from './firestore-query.interface';

/** @deprecated Use {@link FirestoreQueryFilter} via {@link FirestoreQueryBranch}. */
export interface FirestoreEqualityFilter {
  readonly field: string;
  readonly value: unknown;
}

export interface FirestoreBranchQueryOptions {
  readonly branch: FirestoreQueryBranch;
  readonly orderBy?: readonly FirestoreOrderBy[];
  readonly skip?: number;
  readonly take?: number;
  readonly afterPosition?: FirestoreQueryPagePosition;
}

export interface FirestoreBackend {
  get(
    collection: string,
    documentId: string,
  ): Promise<Record<string, unknown> | null>;
  set(
    collection: string,
    documentId: string,
    data: Record<string, unknown>,
    merge?: boolean,
  ): Promise<void>;
  delete(collection: string, documentId: string): Promise<void>;
  queryBranch(
    collection: string,
    options: FirestoreBranchQueryOptions,
  ): Promise<Record<string, unknown>[]>;
  countBranch(
    collection: string,
    branch: FirestoreQueryBranch,
  ): Promise<number>;
}
