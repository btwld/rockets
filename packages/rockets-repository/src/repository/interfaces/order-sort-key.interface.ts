import { PlainLiteralObject } from '@nestjs/common';

import { EntityColumn, SortOrder } from '../repository.types';

// ═══════════════════════════════════════════════════════════════════════════════
// OrderSortKey variants — discriminated union on `order`
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Sortable field. A root sort targets a column of `T` (autocompleted via
 * {@link EntityColumn}); a relation sort (`relation` set) targets a column
 * of the RELATED entity, which `T` cannot name — hence the `string`
 * branch. Parsed sorts also originate from raw query strings, so the
 * string branch matches runtime reality while preserving column
 * suggestions for the common root-sort case.
 */
export type SortField<T extends PlainLiteralObject> =
  | EntityColumn<T>
  | (string & {});

/**
 * A sort key with ascending order.
 */
export interface OrderSortKeyAsc<
  T extends PlainLiteralObject = PlainLiteralObject,
> {
  field: SortField<T>;
  order: typeof SortOrder.ASC;
  relation?: string;
}

/**
 * A sort key with descending order.
 */
export interface OrderSortKeyDesc<
  T extends PlainLiteralObject = PlainLiteralObject,
> {
  field: SortField<T>;
  order: typeof SortOrder.DESC;
  relation?: string;
}
