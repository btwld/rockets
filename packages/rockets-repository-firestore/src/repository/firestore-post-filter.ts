import type { FirestorePostFilter } from '../interfaces/firestore-query.interface';

export function applyFirestorePostFilters(
  rows: readonly Record<string, unknown>[],
  postFilters: readonly FirestorePostFilter[],
): Record<string, unknown>[] {
  if (postFilters.length === 0) {
    return [...rows];
  }

  return rows.filter((row) =>
    postFilters.every((filter) => matchesPostFilter(row, filter)),
  );
}

function matchesPostFilter(
  row: Record<string, unknown>,
  filter: FirestorePostFilter,
): boolean {
  const value = row[filter.field];

  switch (filter.kind) {
    case 'is_null':
      return value === null || value === undefined;
    case 'is_not_null':
      return value !== null && value !== undefined;
    case 'contains':
      return containsValue(value, filter.value);
    case 'not_contains':
      return !containsValue(value, filter.value);
    case 'starts':
      return typeof value === 'string' && value.startsWith(filter.value);
    case 'not_starts':
      return typeof value !== 'string' || !value.startsWith(filter.value);
    case 'ends':
      return typeof value === 'string' && value.endsWith(filter.value);
    case 'not_ends':
      return typeof value !== 'string' || !value.endsWith(filter.value);
    case 'nin':
      return !filter.values.some((candidate) => candidate === value);
    case 'between':
      return compareBetween(value, filter.min, filter.max);
    case 'soft_delete_excluded':
      return value === null || value === undefined;
    default: {
      const _exhaustive: never = filter;
      return _exhaustive;
    }
  }
}

function containsValue(fieldValue: unknown, needle: string): boolean {
  if (Array.isArray(fieldValue)) {
    return fieldValue.some(
      (item) => typeof item === 'string' && item.includes(needle),
    );
  }
  return typeof fieldValue === 'string' && fieldValue.includes(needle);
}

function compareBetween(value: unknown, min: unknown, max: unknown): boolean {
  const sortable = toComparable(value);
  const minComparable = toComparable(min);
  const maxComparable = toComparable(max);
  if (
    sortable === undefined ||
    minComparable === undefined ||
    maxComparable === undefined
  ) {
    return false;
  }
  return sortable >= minComparable && sortable <= maxComparable;
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
