import type { PlainLiteralObject, Provider, Type } from '@nestjs/common';
import type { RocketsEntityHookForResource } from '../../infrastructure/hooks/entity-hook';
import type { Operation } from '@bitwild/rockets-app';
import type { RocketsRepositoryModuleInterface } from '@bitwild/rockets-common';
import type { ResourceKind } from './resource-kind.enum';
import type {
  CrudRequestConfig,
  CrudResponseConfig,
} from '@bitwild/rockets-crud';
import type { WhereCondition } from '@bitwild/rockets-repository';

/**
 * Names of CRUD operations supported by the declarative resource definition.
 *
 * `list`, `read` — query-style operations
 * `create`, `update`, `replace`, `delete`, `softDelete`, `restore` —
 * command-style operations
 */
export type ResourceOperationName =
  | Operation.List
  | Operation.Read
  | Operation.Create
  | Operation.Update
  | Operation.Replace
  | Operation.Delete
  | Operation.SoftDelete
  | Operation.Restore;

/**
 * DTO contract for a resource.
 *
 * When provided, these DTOs drive:
 * - `response.resource` → `response` (single-item response)
 * - `response.paginated` → `paginated` (auto-generated if missing and `response` supplied)
 * - `create` / `update` / `replace` → request body for the respective operation
 */
export interface ResourceDtoConfig {
  readonly response?: Type;
  readonly paginated?: Type;
  readonly create?: Type;
  readonly update?: Type;
  readonly replace?: Type;
}

/**
 * Type-level reference to an entity class constructor.
 *
 * `abstract new (...args: never[]) => T` keeps the type assignable
 * from every concrete constructor (including those with required
 * parameters and abstract classes) without leaking `any` into consumer
 * APIs. Nest's `Type<X>` is assignable to `EntityConstructor<unknown>`
 * thanks to function-parameter contravariance (`any[]` flows into
 * `never[]`).
 *
 * Intersected with `{ readonly name: string }` so callers can produce
 * descriptive error messages (`entityConstructor.name`) without casting.
 */
export type EntityConstructor<T = unknown> = (abstract new (
  ...args: never[]
) => T) & {
  readonly name: string;
};

/**
 * Cross-resource relation entry, produced by the `rel()` helper.
 *
 * One declaration drives both:
 *
 * 1. **Controller side (List/Read joins).** `propertyName` is fed into the
 *    upstream `@CrudJoin` decorator so the relation is eager-loaded on the
 *    generated endpoints. Skipped when `include === 'never'`.
 *
 * 2. **Persistence side (repository relation config).** `federated` and
 *    `distinctFilter` flow into `RepositoryProviderOptions.relations`
 *    keyed by `propertyName`, enabling federation and the sort-safety
 *    distinct filter on the repository layer.
 *
 * `target` is a **class reference** (or a `() => Class` thunk for circular
 * imports). At `buildAppRegistrationPlan` time the class is resolved to a
 * registered persistence key — either from another `defineResource()`
 * bundle, from a `defineModuleResource({ entities: [...] })` row, or from
 * `userMetadata.entity`. Class-as-target gives you compile-time errors if
 * you typo the entity, and `propertyName` is narrowed to `keyof Source`
 * so misspelled property names also fail at compile time.
 *
 * Cardinality (1:1 / 1:N / N:1 / M:N) and inverse-side wiring are inferred
 * by the persistence adapter from the entity's own metadata — no
 * adapter-specific fields leak into this interface.
 */
export interface ResourceRelationEntry<
  S extends object = object,
  T extends EntityConstructor = EntityConstructor,
  K extends string = string,
> {
  /** Owning entity class (the source of the relation). */
  readonly source: EntityConstructor<S>;
  /**
   * Target entity class, or a thunk returning it. Use the thunk form
   * when source/target sit on opposite sides of a circular import.
   */
  readonly target: T | (() => T);
  /**
   * Relation property on the owning entity. Constrained to `keyof Source`
   * so a misspelled property fails at compile time.
   */
  readonly propertyName: K;
  /**
   * When `true`, the relation is federated (read/filtered independently
   * via the target's repository rather than joined in SQL). Required for
   * cross-database relations and OLTP/OLAP mixes.
   */
  readonly federated?: boolean;
  /**
   * Distinct filter applied on the target repository when sorting/paging
   * across a federated one-to-many relation. Without it, a parent with no
   * matching rows is dropped from the result set; with it, the filter is
   * also applied to direct `where` clauses on the relation.
   */
  readonly distinctFilter?: WhereCondition<PlainLiteralObject>;
  /**
   * Controls how the relation is exposed on the controller:
   * - `default` — always eager-loaded on list/read (default behavior).
   * - `never`   — not surfaced on the controller even if declared.
   *
   * Omit to default to `default`.
   */
  readonly include?: 'default' | 'never';
}

/**
 * Optional fields accepted by `relation()` and `BoundRelation<S>`. Kept
 * as a standalone type so the runtime helper signatures stay readable.
 */
export interface RelationOptions {
  /**
   * When `true`, the relation is federated (read/filtered independently
   * via the target's repository rather than joined in SQL). Required for
   * cross-database relations and OLTP/OLAP mixes.
   */
  readonly federated?: boolean;
  /**
   * Distinct filter applied on the target repository when sorting/paging
   * across a federated one-to-many relation.
   */
  readonly distinctFilter?: WhereCondition<PlainLiteralObject>;
  /**
   * `default` — eager-load on list/read (default behavior).
   * `never`   — keep the relation off the controller surface but still
   *             registered for persistence / cross-resource validation.
   */
  readonly include?: 'default' | 'never';
}

/**
 * Source-bound counterpart of the standalone `relation()` helper. The
 * `source` argument is captured ahead of time, so callers only declare
 * the target and the property name. `defineResource()` exposes a
 * `BoundRelation<E>` to consumers via the
 * `relations: (relation) => […]` builder form, locking the source to
 * the resource's `entity` automatically.
 */
export type BoundRelation<S extends object> = <
  T extends EntityConstructor,
  K extends Extract<keyof S, string>,
>(
  target: T | (() => T),
  propertyName: K,
  options?: RelationOptions,
) => ResourceRelationEntry<S, T, K>;

/**
 * Handler override map keyed by operation name.
 * Each value is the command/query handler class for that operation.
 */
export interface ResourceHandlerOverrides {
  readonly list?: Type;
  readonly read?: Type;
  readonly create?: Type;
  readonly update?: Type;
  readonly replace?: Type;
  readonly delete?: Type;
  readonly softDelete?: Type;
  readonly restore?: Type;
}

/**
 * Per-operation configuration for the keyed `operations` form.
 *
 * Co-locates everything the consumer can override for a single operation:
 * request input DTO, output DTO, custom command/query handler, op-specific
 * hooks, route path/method-name, transactional behavior, and any extra
 * decorators. Keeping it in one block per operation is the AI-friendly,
 * grep-friendly shape — no need to cross-reference `dto`, `handlers`, and
 * `overrides.operations` to understand "what does POST do".
 *
 * Every field is optional. Missing values fall back to the resource-level
 * `dto` (for `input` / `output` / `paginated`) and to the framework's
 * default command/query class.
 */
export interface ResourceOperationConfig {
  /** Request input (body) DTO. Maps to `request.body`. Falls back to `definition.dto.{create,update,replace}`. */
  readonly input?: Type;
  /** Single-item output (response) DTO. Maps to `response.resource`. Falls back to `definition.dto.response`. */
  readonly output?: Type;
  /** Paginated response DTO (auto-generated if omitted when needed). */
  readonly paginated?: Type;
  /** Custom command/query handler class. */
  readonly handler?: Type;
  /** Hook classes applied to this operation only (via `@UseHooks`). */
  readonly hooks?: readonly RocketsEntityHookForResource<PlainLiteralObject>[];
  /** Extra method-level decorators applied to this operation route. */
  readonly decorators?: readonly (MethodDecorator | ClassDecorator)[];
  /** Override the route path for this operation (e.g. `restore/:id`). */
  readonly path?: string | string[];
  /** Override the controller method name. */
  readonly methodName?: string;
  /** Wrap this operation in a transaction. */
  readonly transactional?: boolean;
  /**
   * Low-level request override. Use when the auto-derived request shape
   * (body from `input`, params from URL) doesn't fit and you need full
   * control over `params` / `query` shapes.
   */
  readonly requestOverride?: CrudRequestConfig<PlainLiteralObject>;
  /**
   * Low-level response override. Use only when something other than
   * `output` / `paginated` needs to change (e.g. `serialization`,
   * `collection`).
   */
  readonly responseOverride?: CrudResponseConfig;
}

/**
 * `delete` operation configuration.
 *
 * | Field            | Behaviour                                              |
 * | ---------------- | ------------------------------------------------------ |
 * | `soft: false` (default) | Hard delete — `Operation.Delete`. Row is removed permanently. Response: 204 No Content. |
 * | `soft: true`     | Soft delete — `Operation.SoftDelete`. Row is marked deleted via the `@DeleteDateColumn` (TypeORM) or equivalent adapter mechanism. Default response: 204 No Content. |
 * | `returnDeleted: true` (with `soft: true`) | Response: 200 OK with the soft-deleted entity body. Useful for clients that need the timestamp. |
 *
 * `restore` lives in its own top-level key — it is only valid when
 * paired with `delete: { soft: true }`.
 */
export interface ResourceDeleteOperationConfig extends ResourceOperationConfig {
  /** Soft delete vs hard delete. Default: `false` (hard). */
  readonly soft?: boolean;
  /**
   * When `true`, the response is `200 OK` with the soft-deleted entity body
   * (including the `dateDeleted` timestamp). Default: `false`, which keeps
   * the response at `204 No Content`. Only meaningful when `soft: true`.
   */
  readonly returnDeleted?: boolean;
}

/**
 * `restore` operation configuration. Only valid when the resource also
 * declares `delete: { soft: true }` — `defineResource()` throws otherwise.
 *
 * | Field             | Behaviour                                              |
 * | ----------------- | ------------------------------------------------------ |
 * | `returnRestored: true` | Response: 200 OK with the restored entity body. |
 * | `returnRestored: false` (default) | Response: 204 No Content. |
 */
export interface ResourceRestoreOperationConfig
  extends ResourceOperationConfig {
  /**
   * When `true`, the response is `200 OK` with the restored entity body.
   * Default: `false` → `204 No Content`.
   */
  readonly returnRestored?: boolean;
}

/**
 * Keyed operations form — the recommended shape for `defineResource`.
 *
 * Every field is optional; declaring a key opts the operation in. Order
 * of declaration is preserved (used to control route order in upstream
 * NestJS-CRUD).
 *
 * | Key       | Generated CRUD operation                 |
 * | --------- | ---------------------------------------- |
 * | `list`    | `Operation.List`                         |
 * | `read`    | `Operation.Read`                         |
 * | `create`  | `Operation.Create`                       |
 * | `update`  | `Operation.Update`                       |
 * | `replace` | `Operation.Replace`                      |
 * | `delete`  | `Operation.Delete` (or SoftDelete if `soft: true`) |
 * | `restore` | `Operation.Restore` (requires `delete.soft: true`) |
 *
 * @example
 * ```ts
 * defineResource<PetEntity>({
 *   // ...
 *   operations: {
 *     list:   { output: PetDto },
 *     read:   { output: PetDto },
 *     create: { input: PetCreateDto, output: PetDto, handler: PetCreateHandler },
 *     update: { input: PetUpdateDto, output: PetDto },
 *     delete: { soft: true, returnDeleted: true },
 *     restore: { returnRestored: true },
 *   },
 * });
 * ```
 */
export interface ResourceOperationsObject {
  readonly list?: ResourceOperationConfig;
  readonly read?: ResourceOperationConfig;
  readonly create?: ResourceOperationConfig;
  readonly update?: ResourceOperationConfig;
  readonly replace?: ResourceOperationConfig;
  readonly delete?: ResourceDeleteOperationConfig;
  readonly restore?: ResourceRestoreOperationConfig;
}

// ResourceOverrides / ResourceControllerOverrides / ResourceOperationOverride
// were intentionally removed. Their fields collapse cleanly:
//
//   - Per-op `body` / `response` / `handler` / `hooks` / `decorators` /
//     `path` / `methodName` / `transactional` / `request` /
//     `responseOverride` live on `ResourceOperationConfig` (keyed
//     operations form).
//   - Controller-level `extraDecorators` (the only field with real
//     consumer usage) became the root-level `decorators` field on
//     `RocketsResourceDefinition`.
//   - The bearer-auth toggle moved to root-level `public?: boolean`
//     (default `false` — bearer required).
//
// The other rarely-used fields (resolver / adapter / response / request
// / transactional at the controller level) were dropped from the public
// API. They were speculative complexity with zero consumers in the
// monorepo. If a real case appears we add a single dedicated field
// rather than an open-ended `overrides` bag.

/**
 * Declarative resource definition. Pass this to `defineResource()` to
 * receive a ready-to-consume `CrudResource`.
 *
 * Required field: `entity`. `key` / `path` / `tags` are derived from it
 * when omitted; everything else is derived from supplied DTOs
 * (input/output shapes) or configured per operation.
 */
export interface RocketsResourceDefinition<E extends PlainLiteralObject> {
  /**
   * Repository key. Used for dynamic-repository lookup and relation
   * targets.
   *
   * **Optional.** Derived from `entity` via `deriveEntityKey()` when
   * omitted — strip trailing `Entity`, lowercase first char (e.g.
   * `PetTagEntity` → `'petTag'`). Declare explicitly when:
   *  - the derived key would collide with another resource
   *  - you want a namespaced key (e.g. `'billing/invoice'`)
   *  - the class name is awkward (`URLEntity` → `'uRL'`)
   */
  readonly key?: string;
  /** Entity class — drives type safety and auto-registration. */
  readonly entity: Type<E>;
  /**
   * HTTP route path(s) for the generated controller.
   *
   * **Optional.** Defaults to `pluralize(kebab-case(key))` — e.g.
   * `petVaccination` → `pet-vaccinations`. Declare explicitly when:
   * - you want a non-conventional URL (legacy mounts, versioned paths)
   * - the entity needs multiple aliased paths (`path: ['v1/pets', 'pets']`)
   *
   * The default uses the `pluralize` library so irregular plurals
   * (`person → people`, `category → categories`) work out of the box.
   */
  readonly path?: string | string[];
  /**
   * Swagger tag(s) applied to the generated controller.
   *
   * **Optional.** Defaults to a humanised + pluralised version of `key`
   * — e.g. `petVaccination` → `Pet Vaccinations`. Declare explicitly
   * when you want non-conventional Swagger grouping.
   */
  readonly tags?: readonly string[];
  /** DTOs for request/response. Paginated DTO auto-generated if omitted. */
  readonly dto?: ResourceDtoConfig;
  /**
   * Operations to expose.
   *
   * Two equivalent shapes:
   *
   * 1. **Keyed object (recommended).** One block per operation, holding
   *    body/response/handler/hooks/decorators inline. AI-friendly and
   *    grep-friendly:
   *
   * ```ts
   * operations: {
   *   list: { output: PetDto },
   *   create: {
   *     input: PetCreateDto,
   *     output: PetDto,
   *     handler: PetCreateHandler,
   *   },
   *   delete: { soft: true, returnDeleted: true },
   *   restore: { returnRestored: true },
   * }
   * ```
   *
   * 2. **Operation array (low-level escape hatch).** Lists which operations
   *    to enable; per-op DTO/handler/decorator config must come from
   *    `dto`, `handlers`, and `overrides.operations` separately.
   *
   * ```ts
   * operations: [Operation.List, Operation.Read, Operation.Create]
   * ```
   *
   * Defaults to `[List, Read, Create, Update, Delete]` when omitted.
   */
  readonly operations?:
    | readonly ResourceOperationName[]
    | ResourceOperationsObject;
  /**
   * Unified cross-resource relations. Two equivalent forms are accepted:
   *
   * 1. **Builder (recommended).** A function that receives a source-bound
   *    `relation()` and returns the entries:
   *
   * ```ts
   * relations: (relation) => [relation(() => OwnerEntity, 'owner')]
   * ```
   *
   *    The bound `relation` captures the resource `entity` automatically,
   *    so the source can never be mistyped — it is not even passed.
   *
   * 2. **Array (advanced).** Useful when the relation source is not the
   *    resource entity (junction tables) or when entries are composed
   *    from external lists. Each entry must come from the standalone
   *    `relation()` helper:
   *
   * ```ts
   * relations: [relation(SourceEntity, TargetEntity, 'prop')]
   * ```
   *
   * Either form yields the same `ResourceRelationEntry\[\]` after
   * `defineResource()` resolves it.
   */
  readonly relations?:
    | ReadonlyArray<ResourceRelationEntry<E>>
    | ((relation: BoundRelation<E>) => ReadonlyArray<ResourceRelationEntry<E>>);
  /**
   * Repository adapter for this resource's entity (e.g. `TypeOrmRepositoryModule`).
   * Overrides the root `repository` adapter for this one table — provide for
   * multi-adapter apps. Relation-level flags live on `relations`.
   */
  readonly repository?: RocketsRepositoryModuleInterface;
  /** Repository hook classes applied via `@UseHooks` at the controller level. */
  readonly hooks?: readonly RocketsEntityHookForResource<E>[];
  /** Custom handler class per operation (overrides the defaults). */
  readonly handlers?: ResourceHandlerOverrides;
  /**
   * EXTRAS ONLY. Classes referenced in `handlers` and `hooks` are
   * auto-registered as providers (deduped) unless
   * `autoRegisterHandlers === false`.
   *
   * Declare `providers` only for services this resource needs that
   * aren't a handler or hook, e.g. a shared domain service or a
   * `{ provide: TOKEN, useValue: ... }` literal.
   */
  readonly providers?: readonly Provider[];
  /**
   * Set `false` to disable auto-registration of handler/hook classes.
   * When disabled, consumers must provide handler/hook classes explicitly
   * via `providers`. Defaults to `true`.
   */
  readonly autoRegisterHandlers?: boolean;
  /**
   * Class-level decorators applied to the auto-generated controller
   * AFTER the framework's default ones (`@ApiBearerAuth`, `@ApiTags`,
   * `@UseHooks`).
   *
   * Use this for controller-wide concerns: extra `@UseGuards()`,
   * `@UseInterceptors()`, custom Swagger decorators, throttle, etc.
   *
   * For per-operation (method-level) decorators use
   * `operations.X.decorators` instead.
   *
   * @example
   * ```ts
   * defineResource({
   *   key: 'pet',
   *   entity: PetEntity,
   *   path: 'pets',
   *   tags: ['Pets'],
   *   decorators: [UseGuards(MyGuard), UseInterceptors(MyInterceptor)],
   * });
   * ```
   */
  readonly decorators?: readonly ClassDecorator[];
  /**
   * Controller-level CRUD request config. Sets the URL `params` shape
   * that upstream `@bitwild/rockets-crud` validates against the route's
   * `:tokens`. Default:
   *
   * ```ts
   * { params: { id: { field: 'id', type: 'uuid', primary: true } } }
   * ```
   *
   * Set this explicitly when:
   *
   * - the resource path carries extra `:tokens` beyond the conventional
   *   `:id` (sub-resources auto-compose this for you).
   * - the primary key is not `id` or not a uuid.
   *
   * Per-operation `operations.X.request` (escape hatch on
   * {@link ResourceOperationConfig.request}) takes precedence over this
   * controller-level default.
   */
  readonly request?: CrudRequestConfig<PlainLiteralObject>;
  /**
   * When `true`, removes the default `@ApiBearerAuth()` decorator from
   * the generated controller — the routes still pass through whatever
   * global `AuthServerGuard` policy applies, but the OpenAPI spec stops
   * advertising bearer-auth requirements. Default: `false` (bearer auth
   * documented).
   *
   * Combine with `@AuthPublic()` on individual operations (or via
   * `operations.X.decorators`) for routes that genuinely allow
   * unauthenticated access.
   */
  readonly public?: boolean;
  /**
   * Sub-resources nested under this resource's URL.
   *
   * **Keys are constrained to relation properties on the parent entity
   * `E`.** A typo in the segment key fails compilation: only string-typed
   * properties of `E` are accepted. This guarantees the URL segment
   * matches a real relation field on the entity (e.g. `petTags`, `tags`).
   *
   * Each value is the result of {@link defineSubResource}. The parent's
   * primary-key param (`:petId` for a `pet` parent) is auto-prepended:
   *
   * ```ts
   * subResources: { tags: defineSubResource({ ... }) }
   * // -> /pets/:petId/tags (parent.path + ':petId' + 'tags')
   * ```
   *
   * `defineResource()` materialises each sub spec into a full bundle
   * with composed `path`, `request.params`, and `@ApiParam` decorators
   * for the parent param. Sub-resources can themselves nest sub-resources.
   *
   * The parent param name defaults to `${parent.key}Id` (camelCase
   * entity key + "Id"). Override per-sub via
   * {@link RocketsSubResourceDefinition.parentParam}.
   */
  readonly subResources?: Readonly<{
    readonly [K in Extract<keyof E, string>]?: SubResourceForKey<E, K>;
  }>;
}

/**
 * The opaque value returned by `defineSubResource()`. Carries the full
 * sub-definition plus the parent-param override, but defers path
 * composition to the parent's `defineResource()` call.
 *
 * Consumers do not construct this directly — use `defineSubResource()`.
 *
 * The interface is intentionally **non-generic in the entity type** at
 * the storage level. `defineSubResource<E>()` accepts and validates
 * `<E>` at construction time; once stored in a parent's `subResources`
 * map, the entity generic is erased so a single map can hold sub specs
 * for many distinct entity types without forcing the parent to thread
 * each child's type through. Hook tokens on the inner definition still
 * follow {@link RocketsEntityHookForResource} at authoring time; the
 * stored shape widens to `PlainLiteralObject` here so one map can hold
 * many child entity kinds. Runtime validation (relation targets, key
 * collisions) runs at startup.
 */
export interface RocketsSubResourceDefinition<
  Sub extends PlainLiteralObject = PlainLiteralObject,
> {
  readonly kind: ResourceKind.Sub;
  /**
   * Phantom type marker. `Sub` appears in both contravariant
   * (`in: (x: Sub) => void`) and covariant (`out: () => Sub`) positions.
   * With `strictFunctionTypes`, the combination forces **invariance** —
   * two sub-resource definitions are only type-compatible when their
   * entity types match exactly. The field is non-optional at the type
   * level so TS actually engages the variance check; the runtime value
   * is never set (`defineSubResource()` casts past it).
   *
   * Never read at runtime.
   */
  readonly __sub: {
    readonly in: (x: Sub) => void;
    readonly out: () => Sub;
  };
  /**
   * Parent reference: URL path param AND foreign-key column on the
   * sub-entity. Default: `${parentEntityKey}Id` (e.g. `pet` → `petId`).
   */
  readonly parentKey?: string;
  /**
   * Primary-key column on the parent entity, used by the ownership
   * guard. Default: `'id'`.
   */
  readonly parentPk?: string;
  /**
   * URL segment override. The `subResources` object key (constrained to
   * `keyof Parent`) drives type-safety; this field decouples the URL
   * shape from that name when they need to differ.
   *
   * Default: `kebab-case(subResourcesKey)` — e.g. parent key `petTags`
   * → URL segment `pet-tags`. Override when the URL should be
   * different (e.g. `tags` while the entity property is `petTags`).
   */
  readonly segment?: string;
  /**
   * Ownership column for the auto-injected `PathScopeGuard`. Default:
   * `'userId'`. Set `false` to drop the ownership guard (public parent).
   */
  readonly owner?: string | false;
  /**
   * Path-scoping master switch (FK filter + stamp, and the ownership
   * guard). Default: `true`. `false` = unscoped nested route.
   */
  readonly scope?: boolean;
  /**
   * Enable the auto-injected `AfterCreateReloadHook` (off by default).
   */
  readonly reloadAfterCreate?: boolean;
  /**
   * The full resource definition minus `path` (composed by the parent).
   * Erased to `PlainLiteralObject` at the storage layer; the original
   * `<Sub>` is recovered by the phantom `__sub` marker for
   * compile-time matching against the parent's relation property type.
   */
  readonly definition: Omit<
    RocketsResourceDefinition<PlainLiteralObject>,
    'path' | 'tags'
  > & {
    readonly tags?: readonly string[];
  };
}

/**
 * Element type extractor used to narrow the parent property `E[K]` to
 * its element type for sub-resource entity matching.
 *
 * Examples:
 * - `ElementOf<TagEntity[]>` = `TagEntity`
 * - `ElementOf<TagEntity>` = `TagEntity`
 * - `ElementOf<TagEntity | undefined>` = `TagEntity` (unwraps undefined)
 */
export type ElementOf<T> = T extends ReadonlyArray<infer U>
  ? U
  : NonNullable<T>;

/**
 * Constraint applied to each entry in a parent resource's
 * `subResources[K]` map. Forces the sub's entity to match the element
 * type of the relation property `K` on the parent entity `E`.
 *
 * If `E[K]` is not a `PlainLiteralObject`-compatible shape, the
 * constraint widens to `RocketsSubResourceDefinition<PlainLiteralObject>`
 * so the call site still type-checks (e.g. when the property is a
 * primitive — though using such a key as a sub-resource segment is
 * always a programming error).
 */
export type SubResourceForKey<
  E extends PlainLiteralObject,
  K extends keyof E,
> = ElementOf<NonNullable<E[K]>> extends PlainLiteralObject
  ? RocketsSubResourceDefinition<ElementOf<NonNullable<E[K]>>>
  : RocketsSubResourceDefinition<PlainLiteralObject>;
