import type { PlainLiteralObject, Type } from '@nestjs/common';
import type {
  RocketsResourceDefinition,
  RocketsSubResourceDefinition,
} from '../../domain/interfaces/rockets-resource-definition.interface';
import { ResourceKind } from '../../domain/interfaces/resource-kind.enum';

/**
 * Sub-resource definition input — same as `RocketsResourceDefinition`
 * minus `path` (composed automatically from the parent's path) and with
 * `tags` optional (defaults to the parent's tags).
 *
 * `entity` accepts a class **or** a thunk `() => Class`. The thunk form
 * is database-agnostic and resolves circular import cases without any
 * decorator dependency — it is invoked lazily by `defineResource()`
 * when the parent materialises the sub-resource.
 */
export interface RocketsSubResourceInput<E extends PlainLiteralObject>
  extends Omit<RocketsResourceDefinition<E>, 'path' | 'tags' | 'entity'> {
  readonly entity: Type<E> | (() => Type<E>);
  readonly tags?: readonly string[];
  /**
   * The parent reference: both the URL path param and the foreign-key
   * column on the sub-entity that joins back to the parent. Drives
   * `/parent/:<parentKey>/segment`, `WHERE <parentKey> = :<parentKey>`,
   * and the FK stamped on create.
   *
   * Default: `${parentEntityKey}Id` (e.g. parent key `pet` → `petId`).
   * Override for legacy schemas (e.g. `animalId`).
   */
  readonly parentKey?: string;
  /**
   * Primary-key column on the **parent** entity, used by the ownership
   * guard to look the parent up. Default: `'id'`. Override when the
   * parent's PK column is not `id`.
   */
  readonly parentPk?: string;
  /**
   * URL segment override.
   *
   * Default: `kebab-case(subResourcesKey)` — e.g. the parent declared
   * `subResources: { petTags: defineSubResource(...) }` ⇒ URL segment
   * `pet-tags`. Set to decouple the URL from the relation-property name
   * (e.g. property `petTags` but route segment `tags`).
   */
  readonly segment?: string;
  /**
   * Ownership column the auto-injected `PathScopeGuard` checks on the
   * parent (the parent row must have `<owner> === actor.id`).
   *
   * Default: `'userId'` — secure by default. Set `owner: false` to drop
   * the ownership guard entirely (public parent); the path-scope FK
   * filter still applies unless `scope: false`.
   */
  readonly owner?: string | false;
  /**
   * Path-scoping master switch: the FK filter (reads scoped to the
   * parent) + FK stamp (on create). Default: `true`. Set `false` for an
   * unscoped nested route — disables both the FK hook and the ownership
   * guard.
   */
  readonly scope?: boolean;
  /**
   * Enable the auto-injected `AfterCreateReloadHook` so eager relations
   * declared on the sub-entity land on the create response. Off by
   * default to avoid an extra DB round-trip on every create — and
   * because the reload behaviour is adapter-specific (TypeORM's
   * `save()` omits eager loads; other adapters may not).
   *
   * Turn on when the sub has eager relations the consumer depends on.
   */
  readonly reloadAfterCreate?: boolean;
}

/**
 * Declare a sub-resource for use inside the parent's
 * `defineResource({ subResources: { ... } })` map.
 *
 * The returned value is opaque — pass it as the value in the parent's
 * `subResources` object, keyed by the URL segment you want appended.
 *
 * The parent's `defineResource()` materialises this spec into a full
 * `CrudResource` with composed path, params, and auto-injected
 * scope hook + ownership guard.
 *
 * @example
 * Input → output:
 *
 * ```ts
 * // Input — secure by default: owner defaults to 'userId', scope on.
 * const sub = defineSubResource({
 *   key: 'petTag',
 *   entity: PetTagEntity,
 *   segment: 'tags',                     // /pets/:petId/tags
 *   reloadAfterCreate: true,             // opt-in eager reload
 *   operations: {
 *     list:   { output: PetTagDto },
 *     create: { input: PetTagCreateDto, output: PetTagDto },
 *   },
 * });
 *
 * // Output (opaque value carrying parent-binding metadata)
 * {
 *   kind: ResourceKind.Sub,
 *   segment: 'tags',
 *   reloadAfterCreate: true,
 *   definition: {
 *     key: 'petTag',
 *     entity: PetTagEntity,
 *     operations: { list: ..., create: ... },
 *   },
 * }
 *
 * // What the parent defineResource() expands this into at boot:
 * //  • A peer CrudResource with:
 * //    – path: 'pets/:petId/tags' (composed)
 * //    – request.params: { id, petId } (composed)
 * //    – class decorators: ApiTags, ApiParam(:petId), UseHooks(PathScopeHook),
 * //                        UseGuards(PathScopeGuard)
 * //    – providers: PathScopeGuard subclass + AfterCreateReloadHook subclass
 * //  • One additional repository row { key: 'petTag', entity: PetTagEntity }
 * ```
 *
 * Sub-resources can themselves nest sub-resources via the same field.
 */
export function defineSubResource<E extends PlainLiteralObject>(
  input: RocketsSubResourceInput<E>,
): RocketsSubResourceDefinition<E> {
  if (!input.entity || typeof input.entity !== 'function') {
    throw new Error(
      'defineSubResource: `entity` must be a class constructor or a () => Class thunk.',
    );
  }
  if (
    input.key !== undefined &&
    (typeof input.key !== 'string' || input.key.length === 0)
  ) {
    throw new Error(
      'defineSubResource: when provided, `key` must be a non-empty string.',
    );
  }

  // Resolve the entity thunk eagerly when possible. Heuristic: a class
  // constructor function has a `prototype` whose `constructor` points
  // back to itself, while a thunk `() => Class` is a plain function
  // that returns a class. Calling `() => Class` is safe and idempotent.
  // We keep the call here so the rest of the pipeline sees a `Type<E>`.
  const resolvedEntity = isThunk(input.entity) ? input.entity() : input.entity;

  const {
    parentKey,
    parentPk,
    segment,
    owner,
    scope,
    reloadAfterCreate,
    ...definitionRest
  } = input;

  // Storage type uses the phantom `<E>` for compile-time matching at
  // the parent's `subResources[K]` slot, but the inner `definition` is
  // erased to `PlainLiteralObject` to dodge invariance issues.
  const definition = {
    ...definitionRest,
    entity: resolvedEntity,
  } as unknown as RocketsSubResourceDefinition['definition'];

  // The phantom `__sub` field is required at the type level for
  // invariance but is intentionally never set at runtime — readers
  // never look at it. Cast through `unknown` so TypeScript treats the
  // literal as carrying the phantom for compile-time variance checks
  // while the runtime payload stays minimal.
  const bundle = {
    kind: ResourceKind.Sub,
    ...(parentKey !== undefined ? { parentKey } : {}),
    ...(parentPk !== undefined ? { parentPk } : {}),
    ...(segment !== undefined ? { segment } : {}),
    ...(owner !== undefined ? { owner } : {}),
    ...(scope !== undefined ? { scope } : {}),
    ...(reloadAfterCreate !== undefined ? { reloadAfterCreate } : {}),
    definition,
  } as unknown as RocketsSubResourceDefinition<E>;
  return bundle;
}

/**
 * `entity: () => Class` thunk vs `entity: Class`. Class constructors
 * carry a non-empty `prototype`; thunks (arrow functions) usually do
 * not. We distinguish by checking for own-property `prototype` plus a
 * `constructor` self-link — the safest structural shape that also
 * doesn't need to walk runtime to disambiguate.
 */
function isThunk<E extends PlainLiteralObject>(
  value: Type<E> | (() => Type<E>),
): value is () => Type<E> {
  if (typeof value !== 'function') return false;
  // A class declared with `class X {}` has its own `prototype.constructor === X`.
  // An arrow thunk `() => X` does not have a `prototype` property at all.
  return !Object.prototype.hasOwnProperty.call(value, 'prototype');
}

/**
 * Type guard for sub-resource specs. Used by `defineResource()` to
 * detect sub-resources in the `subResources` map.
 */
export function isSubResourceDefinition(
  value: unknown,
): value is RocketsSubResourceDefinition {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    value.kind === ResourceKind.Sub
  );
}

/**
 * Camel-case the input. Used to derive default parent params from the
 * parent's resource key (e.g. `pet` → `petId`, `categoryAddress` →
 * `categoryAddressId`).
 */
export function defaultParentParam(parentKey: string): string {
  return `${parentKey}Id`;
}
