import type { PlainLiteralObject, Provider, Type } from '@nestjs/common';
import type { Operation } from '@concepta/nestjs-common';
import type {
  CrudResolverInterface,
  CrudAdapterProvider,
  CrudRequestConfig,
  CrudResponseConfig,
} from '@bitwild/rockets-crud';
import type {
  RepositoryModuleInterface,
  WhereCondition,
} from '@concepta/nestjs-repository';

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
 * imports). At `prepareResourceRegistration` time the class is resolved to a
 * registered persistence key — either from another `defineResource()`
 * bundle or from `repositories.entities`. Class-as-target gives you
 * compile-time errors if you typo the entity, and `propertyName` is
 * narrowed to `keyof Source` so misspelled property names also fail at
 * compile time.
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
 * Persistence layer configuration for this resource.
 *
 * Only carries the repository module selector. Relation-level persistence
 * flags (federation, distinct filter) live on the top-level `relations`
 * array and are merged into the `RepositoryProviderOptions.relations` map
 * keyed by `propertyName` during resource building.
 */
export interface ResourcePersistenceConfig {
  /**
   * Repository module implementation (e.g. `TypeOrmRepositoryModule`).
   * Defaults to the resource builder's default adapter (today: TypeORM) unless
   * overridden. Provide explicitly for multi-adapter apps.
   */
  readonly module?: RepositoryModuleInterface;
}

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
 * Per-operation override. Lets the consumer change anything we
 * auto-select: command/query class, request/response config, extra
 * decorators, transactional behavior, route path, method name.
 *
 * `request` and `response` are typed directly against the upstream
 * `@bitwild/rockets-crud` shapes — no local mirror.
 *
 * The interface is intentionally **not** generic in the entity type.
 * `CrudRequestConfig<T>` carries `T` in an invariant position (via
 * `CrudParamsOptionsInterface<T>`), which would force consumers to type
 * every downstream utility with the same entity. The practical typing
 * wins — `request.body: Type<CreateDto>` — still flow through without
 * the interface-level generic.
 */
export interface ResourceOperationOverride {
  readonly query?: Type;
  readonly command?: Type;
  readonly request?: CrudRequestConfig<PlainLiteralObject>;
  readonly response?: CrudResponseConfig;
  readonly extraDecorators?: readonly (MethodDecorator | ClassDecorator)[];
  readonly transactional?: boolean;
  readonly path?: string | string[];
  readonly methodName?: string;
  /** Hook classes applied to this operation only (via `@UseHooks`). */
  readonly hooks?: readonly Type[];
}

/**
 * Controller-level escape hatches. Use these when the generated defaults
 * don't fit — every field here overrides the auto-derived value.
 *
 * `adapter`, `request`, and `response` are typed against
 * `PlainLiteralObject` to match the non-generic storage shape of
 * `RocketsResourceConfig`. Upstream's own `CrudAdapterProvider<T>` is
 * invariant in T, so narrowing the override to the consumer's entity
 * and then widening to the storage shape is not expressible without a
 * cast. Keeping the overrides at `PlainLiteralObject` mirrors what the
 * framework does internally and avoids the invariance cascade.
 */
export interface ResourceControllerOverrides {
  /** Set `false` to remove the default `@ApiBearerAuth()` decorator */
  readonly bearerAuth?: boolean;
  /** Override the operation resolver (default: CrudOperationResolver) */
  readonly resolver?: Type<CrudResolverInterface>;
  /** Override the repository adapter at the controller level */
  readonly adapter?: CrudAdapterProvider<PlainLiteralObject>;
  /** Toggle transactional wrapping for all mutating operations */
  readonly transactional?: boolean;
  /** Extra class-level decorators applied after the generated ones */
  readonly extraDecorators?: readonly ClassDecorator[];
  /** Full-response override (merged over auto-derived response) */
  readonly response?: CrudResponseConfig;
  /** Full-request override (merged over auto-derived request) */
  readonly request?: CrudRequestConfig<PlainLiteralObject>;
}

/**
 * Top-level overrides passed to `defineResource()`. Each field is an
 * escape hatch — provide it to override or merge with the auto-generated
 * configuration.
 */
export interface ResourceOverrides {
  /** Controller-level overrides (path, tags, bearer, resolver, …) */
  readonly controller?: ResourceControllerOverrides;
  /** Per-operation overrides */
  readonly operations?: Partial<
    Record<ResourceOperationName, ResourceOperationOverride>
  >;
}

/**
 * Declarative resource definition. Pass this to `defineResource()` to
 * receive a ready-to-consume `RocketsResourceBundle`.
 *
 * Required fields: `key`, `entity`, `path`, `tags`. Everything else is
 * either derived from supplied DTOs (request/response shapes) or
 * configured via `overrides`.
 */
export interface RocketsResourceDefinition<E extends PlainLiteralObject> {
  /** Repository key. Used for dynamic-repository lookup and relation targets. */
  readonly key: string;
  /** Entity class — drives type safety and auto-registration. */
  readonly entity: Type<E>;
  /**
   * HTTP route path(s) for the generated controller. Required — consumers
   * must declare the path explicitly so there is no hidden mapping between
   * a camelCase entity key and a pluralized URL.
   *
   * Example: `path: 'pet-vaccinations'` for key `petVaccination`.
   */
  readonly path: string | string[];
  /**
   * Swagger tag(s) applied to the generated controller. Required — no
   * automatic humanisation/pluralisation.
   *
   * Example: `tags: ['Pet Vaccinations']` for key `petVaccination`.
   */
  readonly tags: readonly string[];
  /** DTOs for request/response. Paginated DTO auto-generated if omitted. */
  readonly dto?: ResourceDtoConfig;
  /**
   * Operations to expose. Defaults to
   * `[List, Read, Create, Update, Delete]` when omitted.
   */
  readonly operations?: readonly ResourceOperationName[];
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
   * Persistence-layer truths about the entity. Currently just the
   * repository module selector; relation-level flags live on `relations`.
   */
  readonly persistence?: ResourcePersistenceConfig;
  /** Repository hook classes applied via `@UseHooks` at the controller level. */
  readonly hooks?: readonly Type[];
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
  /** Full override escape hatch. */
  readonly overrides?: ResourceOverrides;
}
