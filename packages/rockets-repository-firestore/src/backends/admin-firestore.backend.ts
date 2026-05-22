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
  FirestoreQueryBranch,
  FirestoreQueryFilter,
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
    if (options.afterPosition) {
      return this.loadBranchRowsWithCursor(collection, options);
    }

    const rows = await this.loadBranchRows(collection, options.branch);
    const filtered = applyFirestorePostFilters(rows, options.branch.postFilters);
    const ordered = this.sortRows(filtered, options.orderBy);

    const skip = options.skip ?? 0;
    const sliced = ordered.slice(skip);
    if (typeof options.take === 'number' && options.take > 0) {
      return sliced.slice(0, options.take);
    }
    return sliced;
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

  private async loadBranchRowsWithCursor(
    collection: string,
    options: FirestoreBranchQueryOptions,
  ): Promise<Record<string, unknown>[]> {
    const branch = options.branch;
    const orderBy =
      options.orderBy && options.orderBy.length > 0
        ? options.orderBy
        : [{ field: 'id', direction: 'asc' as const }];

    if (branch.documentId || (branch.documentIds && branch.documentIds.length > 0)) {
      throw new Error(
        'Firestore adapter: cursor pagination does not support id/documentIds branches.',
      );
    }

    const cursorId = options.afterPosition?.documentId;
    if (!cursorId) {
      return [];
    }

    const cursorSnap = await this.db().collection(collection).doc(cursorId).get();
    if (!cursorSnap.exists) {
      throw new Error(
        `Firestore adapter: cursor document "${cursorId}" was not found in "${collection}".`,
      );
    }

    let query = this.buildCollectionQuery(collection, branch);
    for (const clause of orderBy) {
      query = query.orderBy(clause.field, clause.direction);
    }
    query = query.startAfter(cursorSnap);
    if (typeof options.take === 'number' && options.take > 0) {
      query = query.limit(options.take + 1);
    }

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

  private sortRows(
    rows: Record<string, unknown>[],
    orderBy?: FirestoreBranchQueryOptions['orderBy'],
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
      next[key] =
        value instanceof Date ? value.toISOString() : value;
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
