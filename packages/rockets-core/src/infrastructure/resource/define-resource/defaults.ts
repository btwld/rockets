import pluralize from 'pluralize';
import { Operation } from '@bitwild/rockets-common';
import type { ResourceOperationName } from '../../../domain/interfaces/rockets-resource-definition.interface';

export const DEFAULT_OPERATIONS: readonly ResourceOperationName[] = [
  Operation.List,
  Operation.Read,
  Operation.Create,
  Operation.Update,
  Operation.Delete,
] as const;

export function defaultPathFromKey(key: string): string {
  const kebab = key
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[_\s]+/g, '-')
    .toLowerCase();
  return pluralize(kebab);
}

export function defaultTagFromKey(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  if (words.length === 0) return key;
  words[words.length - 1] = pluralize(words[words.length - 1]);
  return words.join(' ');
}
