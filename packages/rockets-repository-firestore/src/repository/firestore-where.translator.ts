import {
  isArrayCondition,
  isNullaryCondition,
  isPairCondition,
  isWhereCompound,
  isWhereCondition,
  WhereCompoundOperator,
  WhereOperator,
  type WhereClause,
  type WhereCondition,
  type WhereConditionScalar,
} from '@concepta/nestjs-repository';

import type {
  FirestoreFilterOp,
  FirestorePostFilter,
  FirestoreQueryBranch,
  FirestoreQueryFilter,
} from '../interfaces/firestore-query.interface';

const RANGE_OPS: ReadonlySet<FirestoreFilterOp> = new Set([
  '<',
  '<=',
  '>',
  '>=',
  '!=',
]);

/** Builds one conjunctive branch from DNF conditions (use with `RepositoryAdapter.toDnf`). */
export function translateDnfBranch(
  conditions: readonly WhereCondition[],
): FirestoreQueryBranch {
  return mergeAndBranch([...conditions]);
}

/** @deprecated Prefer `toDnf` + {@link translateDnfBranch} in the repository. */
export function translateWhereClause(clause?: WhereClause): FirestoreQueryBranch[] {
  if (!clause) {
    return [{ filters: [], postFilters: [] }];
  }

  if (isWhereCompound(clause) && clause.operator === WhereCompoundOperator.AND) {
    return [mergeAndBranch(clause.conditions)];
  }

  if (isWhereCondition(clause) && !isNullaryCondition(clause) && !isArrayCondition(clause) && !isPairCondition(clause)) {
    return [translateScalarCondition(clause)];
  }

  if (isWhereCondition(clause)) {
    return [translateCondition(clause)];
  }

  if (isWhereCompound(clause) && clause.operator === WhereCompoundOperator.OR) {
    return clause.conditions.flatMap((child) => translateWhereClause(child));
  }

  return [{ filters: [], postFilters: [] }];
}

function mergeAndBranch(conditions: readonly WhereClause[]): FirestoreQueryBranch {
  const merged: FirestoreQueryFilter[] = [];
  const postFilters: FirestorePostFilter[] = [];
  let documentId: string | undefined;

  for (const child of conditions) {
    if (isWhereCondition(child)) {
      const branch = translateCondition(child);
      if (branch.documentId) {
        documentId = branch.documentId;
      }
      if (branch.documentIds) {
        throw new Error(
          'Firestore adapter: documentIds in an AND branch is not supported — restructure the where clause.',
        );
      }
      merged.push(...branch.filters);
      postFilters.push(...branch.postFilters);
      continue;
    }
    throw new Error(
      'Firestore adapter: nested compounds inside AND must be flattened via RepositoryAdapter.toDnf().',
    );
  }

  assertFirestoreFilterRules(merged);

  return {
    documentId,
    filters: merged,
    postFilters,
  };
}

function readScalarValue(condition: WhereConditionScalar): unknown {
  return condition.value;
}

function readArrayValue(condition: WhereCondition): unknown[] {
  if (!isArrayCondition(condition)) {
    throw new Error('Firestore adapter: expected an array condition.');
  }
  return condition.value;
}

function translateCondition(condition: WhereCondition): FirestoreQueryBranch {
  if (condition.field === 'id') {
    return translateIdCondition(condition);
  }

  if (isNullaryCondition(condition)) {
    return translateNullaryCondition(condition);
  }

  if (isArrayCondition(condition)) {
    return translateArrayCondition(condition);
  }

  if (isPairCondition(condition)) {
    return {
      filters: [],
      postFilters: [
        {
          kind: 'between',
          field: condition.field,
          min: condition.value[0],
          max: condition.value[1],
        },
      ],
    };
  }

  return translateScalarCondition(condition as WhereConditionScalar);
}

function translateIdCondition(condition: WhereCondition): FirestoreQueryBranch {
  switch (condition.operator) {
    case WhereOperator.EQ:
      return {
        documentId: String(readScalarValue(condition as WhereConditionScalar)),
        filters: [],
        postFilters: [],
      };
    case WhereOperator.IN: {
      const values = asArray(readArrayValue(condition)).map((value) => String(value));
      return {
        documentIds: values,
        filters: [],
        postFilters: [],
      };
    }
    default:
      throw unsupportedOperator(condition.operator, condition.field);
  }
}

function translateNullaryCondition(
  condition: WhereCondition,
): FirestoreQueryBranch {
  if (condition.operator === WhereOperator.IS_NULL) {
    return {
      filters: [],
      postFilters: [{ kind: 'is_null', field: condition.field }],
    };
  }
  if (condition.operator === WhereOperator.NOT_NULL) {
    return {
      filters: [{ field: condition.field, op: '!=', value: null }],
      postFilters: [{ kind: 'is_not_null', field: condition.field }],
    };
  }
  throw unsupportedOperator(condition.operator, condition.field);
}

function translateArrayCondition(
  condition: WhereCondition,
): FirestoreQueryBranch {
  const values = asArray(readArrayValue(condition));
  if (condition.operator === WhereOperator.IN) {
    if (values.length > 30) {
      throw new Error(
        `Firestore adapter: "in" supports at most 30 values (field "${condition.field}" has ${values.length}).`,
      );
    }
    return {
      filters: [{ field: condition.field, op: 'in', value: values }],
      postFilters: [],
    };
  }
  if (condition.operator === WhereOperator.NIN) {
    return {
      filters: [],
      postFilters: [{ kind: 'nin', field: condition.field, values }],
    };
  }
  throw unsupportedOperator(condition.operator, condition.field);
}

function translateScalarCondition(
  condition: WhereConditionScalar,
): FirestoreQueryBranch {
  const field = condition.field;
  const value = condition.value;

  switch (condition.operator) {
    case WhereOperator.EQ:
      return { filters: [{ field, op: '==', value }], postFilters: [] };
    case WhereOperator.NE:
      return { filters: [{ field, op: '!=', value }], postFilters: [] };
    case WhereOperator.GT:
      return { filters: [{ field, op: '>', value }], postFilters: [] };
    case WhereOperator.GTE:
      return { filters: [{ field, op: '>=', value }], postFilters: [] };
    case WhereOperator.LT:
      return { filters: [{ field, op: '<', value }], postFilters: [] };
    case WhereOperator.LTE:
      return { filters: [{ field, op: '<=', value }], postFilters: [] };
    case WhereOperator.CONTAINS:
      if (Array.isArray(value)) {
        return {
          filters: [{ field, op: 'array-contains', value }],
          postFilters: [],
        };
      }
      return {
        filters: [],
        postFilters: [{ kind: 'contains', field, value: String(value) }],
      };
    case WhereOperator.NCONTAINS:
      return {
        filters: [],
        postFilters: [{ kind: 'not_contains', field, value: String(value) }],
      };
    case WhereOperator.STARTS:
      return buildPrefixBranch(field, String(value));
    case WhereOperator.NSTARTS:
      return {
        filters: [],
        postFilters: [{ kind: 'not_starts', field, value: String(value) }],
      };
    case WhereOperator.ENDS:
      return {
        filters: [],
        postFilters: [{ kind: 'ends', field, value: String(value) }],
      };
    case WhereOperator.NENDS:
      return {
        filters: [],
        postFilters: [{ kind: 'not_ends', field, value: String(value) }],
      };
    default:
      throw unsupportedOperator(condition.operator, field);
  }
}

/** Prefix range: `field >= value` AND `field < value + suffix`. */
function buildPrefixBranch(field: string, prefix: string): FirestoreQueryBranch {
  return {
    filters: [
      { field, op: '>=', value: prefix },
      { field, op: '<', value: `${prefix}\uf8ff` },
    ],
    postFilters: [],
  };
}

function assertFirestoreFilterRules(filters: readonly FirestoreQueryFilter[]): void {
  const rangeFields = new Set<string>();
  for (const filter of filters) {
    if (RANGE_OPS.has(filter.op) && filter.op !== '!=') {
      rangeFields.add(filter.field);
    }
  }
  if (rangeFields.size > 1) {
    throw new Error(
      `Firestore adapter: range filters on multiple fields (${[...rangeFields].join(', ')}) — use AND on one inequality field per query.`,
    );
  }
}

function asArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error('Firestore adapter: expected an array value for in/nin operator.');
  }
  return value;
}

function unsupportedOperator(operator: string, field: string): Error {
  return new Error(
    `Firestore adapter: unsupported where operator "${operator}" on field "${field}".`,
  );
}
