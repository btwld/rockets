import { getApp } from 'firebase-admin/app';
import {
  getFirestore,
  Timestamp,
  type DocumentData,
  type Query,
} from 'firebase-admin/firestore';

import type {
  FirestoreBackend,
  FirestoreBranchQueryOptions,
} from '../interfaces/firestore-backend.interface';
import type {
  FirestoreFilterOp,
  FirestoreOrderBy,
  FirestoreQueryBranch,
} from '../interfaces/firestore-query.interface';
import { applyFirestorePostFilters } from '../repository/firestore-post-filter';

export class AdminFirestoreBackend implements FirestoreBackend {
  private db() {
    return getFirestore(getApp());
  }

  async get(
    collection: string,
    documentId: string,
  ): Promise<Record<string, unknown> | null> {
    const snap = await this.db().collection(collection).doc(documentId).get();
    if (!snap.exists) {
      return null;
    }
    return this.normalise(snap.data(), documentId);
  }

  async set(
    collection: string,
    documentId: string,
    data: Record<string, unknown>,
    merge = false,
  ): Promise<void> {
    await this.db()
      .collection(collection)
      .doc(documentId)
      .set(this.serialise(data), { merge });
  }

  async delete(collection: string, documentId: string): Promise<void> {
    await this.db().collection(collection).doc(documentId).delete();
  }

  async queryBranch(
    collection: string,
    options: FirestoreBranchQueryOptions,
  ): Promise<Record<string, unknown>[]> {
    const branch = options.branch;
    const skip = options.skip ?? 0;
    const take = options.take;

    if (
      branch.documentId ||
      (branch.documentIds && branch.documentIds.length > 0)
    ) {
      const rows = await this.loadBranchRows(collection, branch);
      const filtered = applyFirestorePostFilters(rows, branch.postFilters);
      const ordered = this.sortRows(filtered, options.orderBy);
      const sliced = ordered.slice(skip);
      return typeof take === 'number' && take > 0
        ? sliced.slice(0, take)
        : sliced;
    }

    // Post-filters require in-memory evaluation, so we cannot rely on
    // server-side limit alone — read all matching docs and slice locally.
    if (branch.postFilters.length > 0) {
      const query = this.buildOrderedQuery(collection, branch, options.orderBy);
      const snapshot = await query.get();
      const rows = snapshot.docs.map((doc) =>
        this.normalise(doc.data(), doc.id),
      );
      const filtered = applyFirestorePostFilters(rows, branch.postFilters);
      const sliced = filtered.slice(skip);
      return typeof take === 'number' && take > 0
        ? sliced.slice(0, take)
        : sliced;
    }

    // Fast path: push orderBy + limit(skip + take) to Firestore, slice(skip)
    // locally. Reads are O(skip + take), not O(collection size).
    let query = this.buildOrderedQuery(collection, branch, options.orderBy);
    if (typeof take === 'number' && take > 0) {
      query = query.limit(skip + take);
    }
    const snapshot = await query.get();
    const rows = snapshot.docs.map((doc) => this.normalise(doc.data(), doc.id));
    return skip > 0 ? rows.slice(skip) : rows;
  }

  async countBranch(
    collection: string,
    branch: FirestoreQueryBranch,
  ): Promise<number> {
    if (
      branch.postFilters.length > 0 ||
      branch.documentId ||
      (branch.documentIds && branch.documentIds.length > 0)
    ) {
      const rows = await this.loadBranchRows(collection, branch);
      return applyFirestorePostFilters(rows, branch.postFilters).length;
    }

    const query = this.buildCollectionQuery(collection, branch);
    const snapshot = await query.count().get();
    return snapshot.data().count;
  }

  private async loadBranchRows(
    collection: string,
    branch: FirestoreQueryBranch,
  ): Promise<Record<string, unknown>[]> {
    if (branch.documentId) {
      const row = await this.get(collection, branch.documentId);
      return row ? [row] : [];
    }

    if (branch.documentIds && branch.documentIds.length > 0) {
      const rows: Record<string, unknown>[] = [];
      for (const documentId of branch.documentIds) {
        const row = await this.get(collection, documentId);
        if (row) {
          rows.push(row);
        }
      }
      return rows;
    }

    const query = this.buildCollectionQuery(collection, branch);
    const snapshot = await query.get();
    return snapshot.docs.map((doc) => this.normalise(doc.data(), doc.id));
  }

  private buildCollectionQuery(
    collection: string,
    branch: FirestoreQueryBranch,
  ): Query {
    let query: Query = this.db().collection(collection);

    for (const filter of branch.filters) {
      query = query.where(
        filter.field,
        filter.op as FirestoreFilterOp,
        filter.value,
      );
    }

    return query;
  }

  private buildOrderedQuery(
    collection: string,
    branch: FirestoreQueryBranch,
    orderBy: readonly FirestoreOrderBy[] | undefined,
  ): Query {
    let query = this.buildCollectionQuery(collection, branch);
    if (orderBy) {
      for (const clause of orderBy) {
        query = query.orderBy(clause.field, clause.direction);
      }
    }
    return query;
  }

  private sortRows(
    rows: Record<string, unknown>[],
    orderBy?: readonly FirestoreOrderBy[],
  ): Record<string, unknown>[] {
    if (!orderBy || orderBy.length === 0) {
      return rows;
    }

    const clause = orderBy[0];
    const desc = clause.direction === 'desc';

    return [...rows].sort((left, right) => {
      const a = left[clause.field];
      const b = right[clause.field];
      if (a === b) {
        return 0;
      }
      if (a === undefined || a === null) {
        return 1;
      }
      if (b === undefined || b === null) {
        return -1;
      }
      const aTime = toSortableTime(a);
      const bTime = toSortableTime(b);
      if (!Number.isNaN(aTime) && !Number.isNaN(bTime)) {
        return desc ? bTime - aTime : aTime - bTime;
      }
      if (typeof a === 'string' && typeof b === 'string') {
        return desc ? b.localeCompare(a) : a.localeCompare(b);
      }
      return desc ? (a < b ? 1 : -1) : a > b ? 1 : -1;
    });
  }

  private serialise(data: Record<string, unknown>): Record<string, unknown> {
    const next: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      next[key] = value instanceof Date ? value.toISOString() : value;
    }
    return next;
  }

  private normalise(
    data: DocumentData | undefined,
    documentId: string,
  ): Record<string, unknown> {
    if (!data) {
      return { id: documentId };
    }
    const next: Record<string, unknown> = { id: documentId };
    for (const [key, value] of Object.entries(data)) {
      next[key] = value instanceof Timestamp ? value.toDate() : value;
    }
    return next;
  }
}

function toSortableTime(value: unknown): number {
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === 'string') {
    return Date.parse(value);
  }
  return Number.NaN;
}
