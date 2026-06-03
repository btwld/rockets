import type {
  FirestoreBackend,
  FirestoreBranchQueryOptions,
} from '../interfaces/firestore-backend.interface';
import type {
  FirestoreQueryBranch,
  FirestoreQueryFilter,
} from '../interfaces/firestore-query.interface';
import { applyFirestorePostFilters } from '../repository/firestore-post-filter';

const stores = new Map<string, Map<string, Record<string, unknown>>>();

function collectionStore(
  collection: string,
): Map<string, Record<string, unknown>> {
  let store = stores.get(collection);
  if (!store) {
    store = new Map();
    stores.set(collection, store);
  }
  return store;
}

/** In-memory Firestore backend for unit tests and explicit test harnesses. */
export class InMemoryFirestoreBackend implements FirestoreBackend {
  async get(
    collection: string,
    documentId: string,
  ): Promise<Record<string, unknown> | null> {
    return collectionStore(collection).get(documentId) ?? null;
  }

  async set(
    collection: string,
    documentId: string,
    data: Record<string, unknown>,
    merge = false,
  ): Promise<void> {
    const store = collectionStore(collection);
    const current = store.get(documentId);
    store.set(
      documentId,
      merge && current ? { ...current, ...data } : { ...data, id: documentId },
    );
  }

  async delete(collection: string, documentId: string): Promise<void> {
    collectionStore(collection).delete(documentId);
  }

  async queryBranch(
    collection: string,
    options: FirestoreBranchQueryOptions,
  ): Promise<Record<string, unknown>[]> {
    const rows = await this.loadBranchRows(collection, options.branch);
    const filtered = applyFirestorePostFilters(
      rows,
      options.branch.postFilters,
    );
    const ordered = sortInMemory(filtered, options.orderBy);

    const sliced = ordered.slice(options.skip ?? 0);
    if (typeof options.take === 'number' && options.take > 0) {
      return sliced.slice(0, options.take);
    }
    return sliced;
  }

  async countBranch(
    collection: string,
    branch: FirestoreQueryBranch,
  ): Promise<number> {
    const rows = await this.loadBranchRows(collection, branch);
    const filtered = applyFirestorePostFilters(rows, branch.postFilters);
    return filtered.length;
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

    const rows = [...collectionStore(collection).values()];
    return rows.filter((row) =>
      branch.filters.every((filter) => matchesFilter(row, filter)),
    );
  }
}

function matchesFilter(
  row: Record<string, unknown>,
  filter: FirestoreQueryFilter,
): boolean {
  const value = row[filter.field];
  switch (filter.op) {
    case '==':
      return value === filter.value;
    case '!=':
      return value !== filter.value;
    case '<':
      return compare(value, filter.value) < 0;
    case '<=':
      return compare(value, filter.value) <= 0;
    case '>':
      return compare(value, filter.value) > 0;
    case '>=':
      return compare(value, filter.value) >= 0;
    case 'in':
      return (
        Array.isArray(filter.value) &&
        filter.value.some((candidate) => candidate === value)
      );
    case 'not-in':
      return (
        Array.isArray(filter.value) &&
        !filter.value.some((candidate) => candidate === value)
      );
    case 'array-contains':
      return Array.isArray(value) && value.includes(filter.value);
    default: {
      const _exhaustive: never = filter.op;
      return _exhaustive;
    }
  }
}

function compare(left: unknown, right: unknown): number {
  const a = toComparable(left);
  const b = toComparable(right);
  if (a === undefined || b === undefined) {
    return -1;
  }
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

function toComparable(value: unknown): number | string | undefined {
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === 'number' || typeof value === 'string') {
    return value;
  }
  return undefined;
}

function sortInMemory(
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
    const cmp = compare(a, b);
    return desc ? -cmp : cmp;
  });
}
