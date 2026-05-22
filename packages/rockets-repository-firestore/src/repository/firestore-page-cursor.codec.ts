import type { RepositoryPageCursor } from '@bitwild/rockets-repository';
import type {
  FirestoreOrderBy,
  FirestoreQueryPagePosition,
} from '../interfaces/firestore-query.interface';

const CURSOR_VERSION = 1 as const;

interface FirestoreCursorPayloadV1 {
  readonly v: typeof CURSOR_VERSION;
  readonly documentId: string;
  readonly orderBy: readonly FirestoreOrderBy[];
}

export function encodeFirestorePageCursor(
  row: Record<string, unknown>,
  orderBy: readonly FirestoreOrderBy[],
): RepositoryPageCursor {
  const documentId = row.id;
  if (typeof documentId !== 'string' || documentId.length === 0) {
    throw new Error('Firestore adapter: cannot encode page cursor without document id.');
  }

  const payload: FirestoreCursorPayloadV1 = {
    v: CURSOR_VERSION,
    documentId,
    orderBy,
  };

  return {
    token: Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url'),
  };
}

export function decodeFirestorePageCursor(
  cursor: RepositoryPageCursor | null | undefined,
): FirestoreQueryPagePosition | undefined {
  if (!cursor?.token) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor.token, 'base64url').toString('utf8')) as unknown;
  } catch {
    throw new Error('Firestore adapter: invalid page cursor token.');
  }

  if (!isCursorPayloadV1(parsed)) {
    throw new Error('Firestore adapter: unsupported page cursor version.');
  }

  return {
    documentId: parsed.documentId,
    orderBy: parsed.orderBy,
  };
}

/** Ensures the cursor was issued for the same sort the client is requesting. */
export function assertCursorOrderMatches(
  position: FirestoreQueryPagePosition,
  orderBy: readonly FirestoreOrderBy[],
): void {
  if (position.orderBy.length !== orderBy.length) {
    throw new Error(
      'Firestore adapter: page cursor order does not match the requested order.',
    );
  }

  for (let index = 0; index < orderBy.length; index += 1) {
    const expected = orderBy[index];
    const actual = position.orderBy[index];
    if (!expected || !actual) {
      throw new Error(
        'Firestore adapter: page cursor order does not match the requested order.',
      );
    }
    if (expected.field !== actual.field || expected.direction !== actual.direction) {
      throw new Error(
        'Firestore adapter: page cursor order does not match the requested order.',
      );
    }
  }
}

function isCursorPayloadV1(value: unknown): value is FirestoreCursorPayloadV1 {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as FirestoreCursorPayloadV1;
  return (
    record.v === CURSOR_VERSION &&
    typeof record.documentId === 'string' &&
    record.documentId.length > 0 &&
    Array.isArray(record.orderBy) &&
    record.orderBy.every(isOrderByClause)
  );
}

function isOrderByClause(value: unknown): value is FirestoreOrderBy {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const clause = value as FirestoreOrderBy;
  return (
    typeof clause.field === 'string' &&
    clause.field.length > 0 &&
    (clause.direction === 'asc' || clause.direction === 'desc')
  );
}
