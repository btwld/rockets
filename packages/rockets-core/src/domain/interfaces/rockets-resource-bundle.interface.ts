import type { PlainLiteralObject } from '@nestjs/common';
import type {
  RepositoryModuleInterface,
  RepositoryProviderOptions,
} from '@concepta/nestjs-repository';
import type { RocketsResourceConfig } from './rockets-resource.interface';
import type { ResourceRelationEntry } from './rockets-resource-definition.interface';

/**
 * The object returned by `defineResource()`.
 *
 * It’s intentionally split in three because Rockets does two different jobs for you:
 * - `core`: the HTTP/CRUD surface (routes, DTOs, operation wiring)
 * - `persistence`: the database table wiring (what repository token + adapter to use)
 * - `meta`: extra info Rockets needs to check relations *before* the app boots
 */
export interface RocketsResourceBundle<
  E extends PlainLiteralObject = PlainLiteralObject,
> {
  /** What `CrudModule` uses to build endpoints + CQRS operation wiring. */
  readonly core: RocketsResourceConfig;
  /**
   * What `RepositoryModule` needs to make `InjectDynamicRepository(key)` work for this entity.
   * If you use more than one storage adapter, `module` says which one.
   */
  readonly persistence: {
    readonly module: RepositoryModuleInterface;
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
}
