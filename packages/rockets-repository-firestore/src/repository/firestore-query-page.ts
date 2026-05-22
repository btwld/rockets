import type { FirestoreBackend } from '../interfaces/firestore-backend.interface';
import type { RepositoryPageCursor } from '@bitwild/rockets-repository';
import type {
  FirestoreOrderBy,
  FirestorePageQueryRequest,
  FirestorePostFilter,
  FirestoreQueryBranch,
} from '../interfaces/firestore-query.interface';
import { encodeFirestorePageCursor } from './firestore-page-cursor.codec';
import { applyFirestorePostFilters } from './firestore-post-filter';

export interface FirestoreQueryPage {
  readonly rows: readonly Record<string, unknown>[];
  readonly nextCursor: RepositoryPageCursor | null;
}

const DEFAULT_CURSOR_ORDER: readonly FirestoreOrderBy[] = [
  { field: 'id', direction: 'asc' },
];

export async function runFirestoreQueryPage(
  backend: FirestoreBackend,
  collection: string,
  request: FirestorePageQueryRequest,
): Promise<FirestoreQueryPage> {
  const pageSize = request.pageSize;
  if (pageSize <= 0) {
    throw new Error('Firestore adapter: pageSize must be greater than zero.');
  }

  const branches = augmentBranchesForSoftDelete(
    request.branches,
    request.softDeleteField,
    request.withDeleted,
  );

  if (branches.length !== 1 || branches[0] === undefined) {
    throw new Error(
      'Firestore adapter: page queries require a single OR-free where branch.',
    );
  }

  const branch = branches[0];
  const orderBy =
    request.orderBy && request.orderBy.length > 0
      ? request.orderBy
      : DEFAULT_CURSOR_ORDER;

  const canUseServerPage = branch.postFilters.length === 0;

  if (!canUseServerPage) {
    return runPageInMemory(backend, collection, {
      ...request,
      branches: [branch],
      orderBy,
    });
  }

  const rows = await backend.queryBranch(collection, {
    branch,
    orderBy,
    take: pageSize + 1,
    afterPosition: request.afterPosition,
  });

  return toQueryPage(rows, pageSize, orderBy);
}

async function runPageInMemory(
  backend: FirestoreBackend,
  collection: string,
  request: FirestorePageQueryRequest & { branches: FirestoreQueryBranch[] },
): Promise<FirestoreQueryPage> {
  const branch = request.branches[0];
  const pageSize = request.pageSize;
  const orderBy =
    request.orderBy && request.orderBy.length > 0
      ? request.orderBy
      : DEFAULT_CURSOR_ORDER;

  const allRows = await backend.queryBranch(collection, {
    branch,
    orderBy,
  });
  const filtered = applyFirestorePostFilters(allRows, branch.postFilters);
  const sorted = sortRows(filtered, orderBy);

  let startIndex = 0;
  if (request.afterPosition) {
    const cursorIndex = sorted.findIndex(
      (row) => row.id === request.afterPosition?.documentId,
    );
    if (cursorIndex < 0) {
      throw new Error(
        `Firestore adapter: cursor document "${request.afterPosition.documentId}" not found in result set.`,
      );
    }
    startIndex = cursorIndex + 1;
  }

  const slice = sorted.slice(startIndex, startIndex + pageSize + 1);
  return toQueryPage(slice, pageSize, orderBy);
}

function toQueryPage(
  rows: readonly Record<string, unknown>[],
  pageSize: number,
  orderBy: readonly FirestoreOrderBy[],
): FirestoreQueryPage {
  const hasMore = rows.length > pageSize;
  const pageRows = hasMore ? rows.slice(0, pageSize) : [...rows];
  const last = pageRows[pageRows.length - 1];

  return {
    rows: pageRows,
    nextCursor:
      hasMore && last
        ? encodeFirestorePageCursor(last, orderBy)
        : null,
  };
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

function sortRows(
  rows: Record<string, unknown>[],
  orderBy: readonly FirestoreOrderBy[],
): Record<string, unknown>[] {
  const clause = orderBy[0];
  if (!clause) {
    return rows;
  }

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
