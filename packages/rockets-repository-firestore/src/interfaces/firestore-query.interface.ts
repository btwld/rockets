/** Firestore Admin SDK comparison operators we map from `WhereOperator`. */
export type FirestoreFilterOp =
  | '=='
  | '!='
  | '<'
  | '<='
  | '>'
  | '>='
  | 'in'
  | 'not-in'
  | 'array-contains';

export interface FirestoreQueryFilter {
  readonly field: string;
  readonly op: FirestoreFilterOp;
  readonly value: unknown;
}

export interface FirestoreOrderBy {
  readonly field: string;
  readonly direction: 'asc' | 'desc';
}

/** Filters applied in memory when Firestore cannot express them natively. */
export type FirestorePostFilter =
  | { readonly kind: 'is_null'; readonly field: string }
  | { readonly kind: 'is_not_null'; readonly field: string }
  | {
      readonly kind: 'contains';
      readonly field: string;
      readonly value: string;
    }
  | {
      readonly kind: 'not_contains';
      readonly field: string;
      readonly value: string;
    }
  | { readonly kind: 'starts'; readonly field: string; readonly value: string }
  | {
      readonly kind: 'not_starts';
      readonly field: string;
      readonly value: string;
    }
  | { readonly kind: 'ends'; readonly field: string; readonly value: string }
  | {
      readonly kind: 'not_ends';
      readonly field: string;
      readonly value: string;
    }
  | {
      readonly kind: 'nin';
      readonly field: string;
      readonly values: readonly unknown[];
    }
  | {
      readonly kind: 'between';
      readonly field: string;
      readonly min: unknown;
      readonly max: unknown;
    }
  | { readonly kind: 'soft_delete_excluded'; readonly field: string };

/** One conjunctive branch (AND of conditions) — OR becomes multiple branches. */
export interface FirestoreQueryBranch {
  readonly documentId?: string;
  /** Lookup by document id when `Where.in('id', [...])`. */
  readonly documentIds?: readonly string[];
  readonly filters: readonly FirestoreQueryFilter[];
  readonly postFilters: readonly FirestorePostFilter[];
}

export interface FirestoreQueryRequest {
  readonly branches: readonly FirestoreQueryBranch[];
  readonly orderBy?: readonly FirestoreOrderBy[];
  readonly skip?: number;
  readonly take?: number;
  readonly withDeleted?: boolean;
  readonly softDeleteField?: string;
}
