import type { PlainLiteralObject, Type } from '@nestjs/common';
import type { RepositoryMetadataInterface } from '@bitwild/rockets-repository';

import {
  FIRESTORE_ALT_SOFT_DELETE_FIELD,
  FIRESTORE_DEFAULT_SOFT_DELETE_FIELD,
} from '../constants/firestore-soft-delete.constants';

const DEFAULT_PRIMARY = 'id';

export function buildFirestoreEntityMetadata<Entity extends PlainLiteralObject>(
  entityType: Type<Entity>,
  collection: string,
  softDeleteFieldOverride?: string,
): RepositoryMetadataInterface<Entity> {
  const softDeleteField =
    softDeleteFieldOverride ?? detectSoftDeleteField(entityType);
  const propertyNames = listEntityPropertyNames(entityType);

  const columns = propertyNames.map((name) => ({
    name,
    isPrimary: name === DEFAULT_PRIMARY,
    isRemoveDate: softDeleteField !== undefined && name === softDeleteField,
  }));

  if (!columns.some((col) => col.isPrimary)) {
    columns.unshift({
      name: DEFAULT_PRIMARY,
      isPrimary: true,
      isRemoveDate: false,
    });
  }

  if (
    softDeleteField !== undefined &&
    !columns.some((col) => col.name === softDeleteField)
  ) {
    columns.push({
      name: softDeleteField,
      isPrimary: false,
      isRemoveDate: true,
    });
  }

  return {
    name: collection,
    type: entityType,
    columns,
    relations: [],
  };
}

export function resolveSoftDeleteFieldFromMetadata<
  Entity extends PlainLiteralObject,
>(metadata: RepositoryMetadataInterface<Entity>): string | undefined {
  const column = metadata.columns.find((col) => col.isRemoveDate);
  return column?.name;
}

function detectSoftDeleteField<Entity extends PlainLiteralObject>(
  entityType: Type<Entity>,
): string | undefined {
  try {
    const instance = new entityType();
    if (FIRESTORE_DEFAULT_SOFT_DELETE_FIELD in instance) {
      return FIRESTORE_DEFAULT_SOFT_DELETE_FIELD;
    }
    if (FIRESTORE_ALT_SOFT_DELETE_FIELD in instance) {
      return FIRESTORE_ALT_SOFT_DELETE_FIELD;
    }
  } catch {
    // Some entities require constructor args — fall back to name heuristics.
  }

  const names = new Set(listEntityPropertyNames(entityType));
  if (names.has(FIRESTORE_DEFAULT_SOFT_DELETE_FIELD)) {
    return FIRESTORE_DEFAULT_SOFT_DELETE_FIELD;
  }
  if (names.has(FIRESTORE_ALT_SOFT_DELETE_FIELD)) {
    return FIRESTORE_ALT_SOFT_DELETE_FIELD;
  }
  return undefined;
}

function listEntityPropertyNames<Entity extends PlainLiteralObject>(
  entityType: Type<Entity>,
): (keyof Entity & string)[] {
  const names = new Set<string>();
  let proto: object | null = entityType.prototype;
  while (proto && proto !== Object.prototype) {
    for (const key of Object.getOwnPropertyNames(proto)) {
      if (key !== 'constructor') {
        names.add(key);
      }
    }
    proto = Object.getPrototypeOf(proto);
  }
  return [...names] as (keyof Entity & string)[];
}
