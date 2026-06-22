# Upstream divergence ledger — `@bitwild/rockets-repository`

Kept byte-identical to upstream `@concepta/rockets-repository`
(branch `feature/rockets-zero`) for a straight future migration. Only the
items below are deliberate source differences.

## Intentional divergences (deliberate, to be upstreamed)

### 1. `src/repository/interfaces/order-sort-key.interface.ts` — `SortField` widening
Upstream types the sort `field` as `EntityColumn<T>`. We widen it to
`SortField<T> = EntityColumn<T> | (string & {})` so relation sorts (whose
column belongs to the RELATED entity, unnameable by `T`) and sorts parsed from
raw query strings type-check. Used internally by the query parser and
federation filter analyzer.
- Cannot be moved to `rockets-common`: it is a type on a canonical interface
  consumed internally; there is no extractable symbol.
- Resolution path: contribute the widening to upstream.

## Tooling drift (NOT deliberate — auto-resolves on migration)
- `src/exceptions/repository-query.exception.ts`: `declare context` +
  `this.context` vs upstream `context` + `super.context` (TS field-override
  init; behavioral no-op).

## Extracted to `@bitwild/rockets-common` (no longer in this package)
- `SchemaEntityCompiler` / `SchemaEntityCompilerOptions` interfaces (the
  `entityCompiler?` field was removed from `RepositoryModuleInterface`;
  the extension lives in `rockets-common` as `RocketsRepositoryModuleInterface`).
- Entity-class `InjectDynamicRepository` (the string-only upstream decorator
  stays here; the class-resolving wrapper lives in `rockets-common`).
