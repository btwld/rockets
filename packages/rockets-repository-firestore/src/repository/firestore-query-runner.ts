import type { FirestoreBackend } from '../interfaces/firestore-backend.interface';
import type {
  FirestoreOrderBy,
  FirestorePostFilter,
  FirestoreQueryBranch,
  FirestoreQueryRequest,
} from '../interfaces/firestore-query.interface';

export async function runFirestoreQuery(
  backend: FirestoreBackend,
  collection: string,
  request: FirestoreQueryRequest,
): Promise<Record<string, unknown>[]> {
  const branches = augmentBranchesForSoftDelete(
    request.branches,
    request.softDeleteField,
    request.withDeleted,
  );

  const merged = new Map<string, Record<string, unknown>>();

  const pushToServer =
    branches.length === 1 &&
    branches[0] !== undefined &&
    branches[0].postFilters.length === 0;

  for (const branch of branches) {
    const rows = await backend.queryBranch(collection, {
      branch,
      orderBy: pushToServer ? request.orderBy : undefined,
      skip: pushToServer ? request.skip : undefined,
      take: pushToServer ? request.take : undefined,
    });

    for (const row of rows) {
      const id = readDocumentId(row);
      if (id) {
        merged.set(id, row);
      }
    }
  }

  let results = [...merged.values()];

  if (!pushToServer) {
    results = sortRows(results, request.orderBy);
    if (typeof request.skip === 'number' && request.skip > 0) {
      results = results.slice(request.skip);
    }
    if (typeof request.take === 'number' && request.take > 0) {
      results = results.slice(0, request.take);
    }
  }

  return results;
}

export async function runFirestoreCount(
  backend: FirestoreBackend,
  collection: string,
  request: Omit<FirestoreQueryRequest, 'orderBy' | 'skip' | 'take'>,
): Promise<number> {
  const branches = augmentBranchesForSoftDelete(
    request.branches,
    request.softDeleteField,
    request.withDeleted,
  );

  if (
    branches.length === 1 &&
    branches[0] !== undefined &&
    branches[0].postFilters.length === 0
  ) {
    return backend.countBranch(collection, branches[0]);
  }

  const rows = await runFirestoreQuery(backend, collection, {
    ...request,
    orderBy: undefined,
    skip: undefined,
    take: undefined,
  });
  return rows.length;
}

function augmentBranchesForSoftDelete(
  branches: readonly FirestoreQueryBranch[],
  softDeleteField: string | undefined,
  withDeleted: boolean | undefined,
): FirestoreQueryBranch[] {
  if (!softDeleteField || withDeleted === true) {
    return [...branches];
  }

  const exclusion: FirestorePostFilter = {
    kind: 'soft_delete_excluded',
    field: softDeleteField,
  };

  return branches.map((branch) => ({
    ...branch,
    postFilters: [...branch.postFilters, exclusion],
  }));
}

function readDocumentId(row: Record<string, unknown>): string | undefined {
  const id = row.id;
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}

function sortRows(
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

function toSortableTime(value: unknown): number {
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === 'string') {
    return Date.parse(value);
  }
  return Number.NaN;
}
