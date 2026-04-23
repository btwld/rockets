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
 * Unified cross-resource relation entry.
 *
 * Drives two separate concerns with one declaration:
 *
 * 1. **Controller side (List/Read joins).** The `propertyName` (or `target`
 *    if `propertyName` is omitted) is fed into the upstream `@CrudJoin`
 *    decorator so the relation is eager-loaded on the generated endpoints.
 *    Skipped when `include === 'never'`.
 *
 * 2. **Persistence side (repository relation config).** `federated` and
 *    `distinctFilter` flow into `RepositoryProviderOptions.relations`
 *    keyed by `propertyName ?? target`, enabling federation and the
 *    sort-safety distinct filter on the repository layer.
 *
 * The `target` field is a **string resource key** referencing another
 * `defineResource()` bundle registered in the same module. Cross-resource
 * validation runs at `aggregateResources` time — a target that points at
 * an unknown key throws with a descriptive diagnostic rather than failing
 * silently downstream.
 */
export interface ResourceRelationEntry {
  /**
   * Key of the target resource (matches another resource's `key`).
   * Used for cross-resource validation in `aggregateResources`.
   */
  readonly target: string;
  /**
   * TypeORM relation property on the owning entity. Defaults to `target`
   * when omitted — set explicitly when the column name differs from the
   * target resource key (e.g. `propertyName: 'vaccinations'` targeting the
   * `petVaccination` resource).
   */
  readonly propertyName?: string;
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
   * Defaults to the first module registered in the aggregator, or to a
   * consumer-supplied default. Provide explicitly for multi-adapter apps.
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
   * Unified cross-resource relations. Each entry feeds both the controller
   * (`@CrudJoin`) and the persistence layer
   * (`RepositoryProviderOptions.relations`). See `ResourceRelationEntry`
   * for the field-by-field semantics.
   */
  readonly relations?: readonly ResourceRelationEntry[];
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
