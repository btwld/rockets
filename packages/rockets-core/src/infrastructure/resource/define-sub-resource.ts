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
   * Override the parent-param name appended to the URL. Defaults to
   * `${parent.key}Id` (camelCase parent entity key + "Id").
   *
   * Use when the parent key is multi-word and the conventional
   * `${key}Id` is awkward (e.g. parent key `categoryAddress` → default
   * `categoryAddressId`; override to something shorter).
   */
  readonly parentParam?: string;
  /**
   * Foreign-key column on the sub-entity that joins back to the parent.
   * Defaults to `parentParam` (most child tables follow `<parent>Id` for
   * both URL param and FK column).
   *
   * Set this when the FK column has a different name from the URL param
   * (legacy schemas, junction tables with composite keys, etc.).
   */
  readonly parentForeignKey?: string;
  /**
   * URL segment override.
   *
   * Default: `kebab-case(subResourcesKey)` — e.g. the parent declared
   * `subResources: { petTags: defineSubResource(...) }` ⇒ URL segment
   * `pet-tags`. Set this field to decouple the URL shape from the
   * relation-property name.
   *
   * Useful when the entity property is `petTags` (forced by type-safety)
   * but the URL segment must remain `tags` for a friendlier route.
   */
  readonly urlSegment?: string;
  /**
   * Parent owner column name used by the auto-injected `PathScopeGuard`.
   * **Required** unless `disablePathScopeGuard: true`. There is no
   * default — wrong column = silent 404 for legitimate users, so the
   * core forces an explicit declaration.
   */
  readonly parentOwnerColumn?: string;
  /**
   * Disable the auto-injected `PathScopeGuard`. Use only when the parent
   * is public (no ownership check) or you supply your own guard via
   * `decorators: [UseGuards(MyGuard)]`.
   */
  readonly disablePathScopeGuard?: boolean;
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
 * // Input
 * const sub = defineSubResource({
 *   key: 'petTag',
 *   entity: PetTagEntity,
 *   urlSegment: 'tags',                  // /pets/:petId/tags
 *   parentOwnerColumn: 'userId',         // required (no default)
 *   reloadAfterCreate: true,             // opt-in eager reload
 *   operations: {
 *     list:   { response: PetTagDto },
 *     create: { body: PetTagCreateDto, response: PetTagDto },
 *   },
 * });
 *
 * // Output (opaque value carrying parent-binding metadata)
 * {
 *   kind: ResourceKind.Sub,
 *   urlSegment: 'tags',
 *   parentOwnerColumn: 'userId',
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
    parentParam,
    parentForeignKey,
    urlSegment,
    parentOwnerColumn,
    disablePathScopeGuard,
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
    ...(parentParam !== undefined ? { parentParam } : {}),
    ...(parentForeignKey !== undefined ? { parentForeignKey } : {}),
    ...(urlSegment !== undefined ? { urlSegment } : {}),
    ...(parentOwnerColumn !== undefined ? { parentOwnerColumn } : {}),
    ...(disablePathScopeGuard !== undefined ? { disablePathScopeGuard } : {}),
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
