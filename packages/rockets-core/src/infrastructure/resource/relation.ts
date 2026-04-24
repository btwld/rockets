import type {
  BoundRelation,
  EntityConstructor,
  RelationOptions,
  ResourceRelationEntry,
} from '../../domain/interfaces/rockets-resource-definition.interface';

/**
 * Type-safe relation declaration helper.
 *
 * `relation()` returns the same shape as a `ResourceRelationEntry` but
 * the generics narrow `target` to the **target entity class** and
 * `propertyName` to **`keyof Source`** — both validated at compile time.
 *
 * - `target` accepts the class directly, or a `() => Class` thunk to
 *   break circular imports between two entity files.
 * - `propertyName` is constrained to `keyof Source`. A typo raises a
 *   compile error rather than failing at boot time.
 * - Cardinality (1:1 / 1:N / N:1 / M:N) and inverse-side wiring are not
 *   declared here — the persistence adapter infers them from the
 *   entity's own metadata, keeping `relation()` adapter- and
 *   database-agnostic.
 *
 * @example
 * Direct class target (no import cycle):
 * ```ts
 * relations: [
 *   relation(PetEntity, PetVaccinationEntity, 'vaccinations'),
 *   relation(PetEntity, OwnerEntity, 'owner', { federated: true }),
 *   relation(PetEntity, TagEntity, 'tags'), // M:N — adapter infers
 * ]
 * ```
 *
 * @example
 * Thunk target (breaks a circular import between entity files):
 * ```ts
 * relations: [relation(PetEntity, () => OwnerEntity, 'owner')]
 * ```
 */
export function relation<
  S extends object,
  T extends EntityConstructor,
  K extends Extract<keyof S, string>,
>(
  source: EntityConstructor<S>,
  target: T | (() => T),
  propertyName: K,
  options: RelationOptions = {},
): ResourceRelationEntry<S, T, K> {
  return {
    source,
    target,
    propertyName,
    ...(options.federated !== undefined && { federated: options.federated }),
    ...(options.distinctFilter !== undefined && {
      distinctFilter: options.distinctFilter,
    }),
    ...(options.include !== undefined && { include: options.include }),
  };
}

/**
 * Factory returning a `BoundRelation<S>` closed over `source`. Delegates
 * to the standalone `relation()` so the runtime shape is identical
 * across both entry points — the difference is purely ergonomic /
 * type-safety.
 */
export function createBoundRelation<S extends object>(
  source: EntityConstructor<S>,
): BoundRelation<S> {
  return (target, propertyName, options) =>
    relation(source, target, propertyName, options);
}

/**
 * Resolve the target class of a relation entry, calling the lazy thunk
 * exactly once. Used internally by the aggregator and by
 * `defineResource` when they need the concrete class without forcing
 * every caller to re-implement the class-vs-thunk discriminator.
 *
 * The thunk form must be an **arrow function** (`() => Class`) — the
 * same convention TypeORM uses for `@OneToMany(() => Entity, ...)`.
 * Arrow functions are the only `function`-typed values whose `prototype`
 * is `undefined`, which makes them trivially distinguishable from class
 * constructors at runtime without `Function.prototype.toString` parsing.
 */
export function resolveRelationTarget(
  entry: ResourceRelationEntry,
): EntityConstructor {
  const target = entry.target;
  if (isEntityClassConstructor(target)) {
    return target;
  }
  return (target as () => EntityConstructor)();
}

function isEntityClassConstructor(
  value: unknown,
): value is EntityConstructor {
  if (typeof value !== 'function') return false;
  // Arrow functions have `prototype === undefined`. Classes and regular
  // functions both expose a prototype object. Combined with the
  // documented convention that lazy targets must be arrow functions,
  // this cleanly separates class-as-target from `() => Class` thunks.
  return (value as { prototype?: unknown }).prototype !== undefined;
}
