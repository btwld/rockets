import type { PlainLiteralObject } from '@nestjs/common';
import type {
  RepositoryModuleInterface,
  RepositoryProviderOptions,
} from '@concepta/nestjs-repository';
import type { RocketsResourceConfig } from './rockets-resource.interface';
import type { ResourceRelationEntry } from './rockets-resource-definition.interface';

/**
 * Rich descriptor returned by `defineResource()`.
 *
 * Combines:
 * - `core`: the `RocketsResourceConfig` fed into `RocketsCoreModule.forFeature`.
 * - `persistence`: the `RepositoryProviderOptions` + `module` pair that the
 *   server-side `aggregateResources` groups into `repositoryPersistence`.
 * - `meta`: registration-time metadata (the resource key, the entity class,
 *   and the unified relations list used for cross-resource validation at
 *   startup).
 *
 * The bundle is the single value consumers pass to `RocketsModule.forRoot`.
 * The server unpacks `core` + `persistence` internally — consumers do not
 * touch either directly.
 */
export interface RocketsResourceBundle<
  E extends PlainLiteralObject = PlainLiteralObject,
> {
  /** Configuration forwarded into `RocketsCoreModule.resources[]`. */
  readonly core: RocketsResourceConfig;
  /**
   * Persistence-layer registration. The aggregator groups entities by
   * `module` into one `RepositoryFeatureOptions` entry per adapter.
   */
  readonly persistence: {
    readonly module: RepositoryModuleInterface;
    readonly entity: RepositoryProviderOptions<E>;
  };
  /**
   * Registration-time metadata used by `aggregateResources` for cross-
   * resource validation (e.g. verifying every `relations[].target`
   * string resolves to a registered bundle key).
   */
  readonly meta: {
    readonly key: string;
    readonly entityClass: new () => E;
    readonly relations: readonly ResourceRelationEntry[];
  };
}
