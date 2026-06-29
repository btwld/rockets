import type { PlainLiteralObject } from '@nestjs/common';
import type {
  RepositoryModuleInterface,
  RepositoryProviderOptions,
} from '@concepta/nestjs-repository';
import type { RocketsResourceConfig } from './rockets-resource.interface';
import type { ResourceRelationEntry } from './rockets-resource-definition.interface';
import type { ResourceKind } from './resource-kind.enum';

/**
 * The object returned by `defineResource()`.
 *
 * It’s intentionally split in three because Rockets does two different jobs for you:
 * - `core`: the HTTP/CRUD surface (routes, DTOs, operation wiring)
 * - `persistence`: the database table wiring (what repository token + adapter to use)
 * - `meta`: extra info Rockets needs to check relations *before* the app boots
 */
export interface CrudResource<
  E extends PlainLiteralObject = PlainLiteralObject,
> {
  readonly kind: ResourceKind.Crud;
  /** What `CrudModule` uses to build endpoints + CQRS operation wiring. */
  readonly core: RocketsResourceConfig;
  /**
   * What `RepositoryModule` needs to make `InjectDynamicRepository(key)` work for this entity.
   * If you use more than one storage adapter, `module` says which one.
   *
   * `module` is optional: when omitted, the aggregator falls back to the
   * root `repository` adapter passed to `RocketsCoreModule`. Set it
   * explicitly only to opt this resource out of the app default.
   */
  readonly persistence: {
    readonly module?: RepositoryModuleInterface;
    readonly entity: RepositoryProviderOptions<E>;
  };
  /**
   * The “Rockets-only” part: the resource `key`, the `entity` class, and the list of
   * relations. Startup validation uses this to make sure you didn’t point a relation
   * at a table/entity the module doesn’t know about.
   */
  readonly meta: {
    readonly key: string;
    readonly entityClass: new () => E;
    readonly relations: ReadonlyArray<ResourceRelationEntry<E>>;
  };
  /**
   * Bundles materialised from `defineResource({ subResources: { … } })`.
   * Each entry is a fully-formed `CrudResource` with composed
   * `path`, `request.params`, and `@ApiParam` decorators for the parent
   * param. The aggregator flattens these recursively when building the
   * `AppRegistrationPlan`.
   */
  readonly subResources?: ReadonlyArray<CrudResource<PlainLiteralObject>>;
}
