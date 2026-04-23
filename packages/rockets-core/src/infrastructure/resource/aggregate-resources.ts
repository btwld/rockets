import type { PlainLiteralObject, Type } from '@nestjs/common';
import type {
  RepositoryModuleInterface,
  RepositoryProviderOptions,
} from '@concepta/nestjs-repository';
import type { RepositoryPersistenceConfig } from '../../domain/interfaces/repository-persistence.interface';
import type { RocketsResourceConfig } from '../../domain/interfaces/rockets-resource.interface';
import type { RocketsResourceBundle } from '../../domain/interfaces/rockets-resource-bundle.interface';

/**
 * Result of aggregating one or more `RocketsResourceBundle` instances.
 *
 * - `resources` — flat list fed into `RocketsCoreModule.resources[]`.
 * - `repositoryPersistence` — entities grouped by persistence adapter module,
 *   derived from `defineResource()` bundles. One `RepositoryModule.forFeature()`
 *   call per entry.
 */
export interface AggregatedResources {
  readonly resources: ReadonlyArray<RocketsResourceConfig>;
  readonly repositoryPersistence: ReadonlyArray<RepositoryPersistenceConfig>;
}

/**
 * Raw, non-bundle input accepted by the server's `resources` option.
 *
 * Accepting both shapes lets consumers mix hand-written `RocketsResourceConfig`
 * values with `defineResource()` bundles. Raw configs contribute nothing to
 * `repositoryPersistence` (the consumer must register entities via
 * `repositories.register` in the module options).
 */
export type RocketsResourceInput<
  E extends PlainLiteralObject = PlainLiteralObject,
> = RocketsResourceBundle<E> | RocketsResourceConfig;

/**
 * Type guard — `true` when `input` is a `defineResource()` bundle rather
 * than a raw `RocketsResourceConfig`. Detects the `core`/`persistence`/
 * `meta` triple that only bundles carry.
 */
export function isRocketsResourceBundle(
  input: RocketsResourceInput,
): input is RocketsResourceBundle {
  return (
    typeof input === 'object' &&
    input !== null &&
    'core' in input &&
    'persistence' in input &&
    'meta' in input
  );
}

/**
 * Convert an array of `RocketsResourceInput` items (a mix of `defineResource()`
 * bundles and raw `RocketsResourceConfig` objects) into the flat structures
 * that `RocketsCoreModule.forRootAsync()` expects.
 *
 * ## Algorithm (4 steps)
 *
 * 1. **Partition** — separate `RocketsResourceBundle` items (from
 *    `defineResource()`) from raw `RocketsResourceConfig` items. Only
 *    bundles carry persistence metadata; raw configs do not.
 *
 * 2. **Derive persistence from bundles** — group bundle entities by their
 *    persistence adapter module (e.g. `TypeOrmRepositoryModule`). Within
 *    each module group, deduplicate by entity class — two bundles backed
 *    by the same entity produce one `forFeature` entry. Throws if two
 *    bundles disagree on key or relations for the same entity class.
 *
 * 3. **Validate relations** — every `relation.target` string declared by a
 *    bundle must match the `key` of another registered bundle. Catches
 *    typos and missing resource imports at bootstrap.
 *
 * 4. **Build output** — return `{ resources, repositoryPersistence }` where
 *    `resources` is the flat array of CRUD configs and `repositoryPersistence`
 *    is the bundle-derived persistence array.
 *
 * @param args - Wrapper whose `resources` array contains bundles and/or raw
 * CRUD configs to flatten.
 *
 * @throws When a relation target references an unregistered resource key.
 * @throws When two bundles register the same entity class with conflicting config.
 *
 * @example
 * Input — a mix of one `defineResource()` bundle and one raw config:
 * ```ts
 * const petBundle = defineResource({
 *   key: 'pet',
 *   entity: PetEntity,
 *   persistence: { module: TypeOrmRepositoryModule },
 *   relations: [{ target: 'user', propertyName: 'owner' }],
 *   crud: { controller: { path: 'pets', ... }, operations: [...] },
 * });
 *
 * const rawReportConfig: RocketsResourceConfig = {
 *   crud: { controller: { path: 'reports', ... }, operations: [...] },
 * };
 *
 * aggregateResources({ resources: [petBundle, rawReportConfig] });
 * ```
 *
 * Output — flattened + grouped by persistence module:
 * ```ts
 * {
 *   resources: [
 *     petBundle.core,   // pulled out of the bundle
 *     rawReportConfig,  // passed through untouched
 *   ],
 *   repositoryPersistence: [
 *     {
 *       module: TypeOrmRepositoryModule,
 *       entities: [
 *         { key: 'pet', entity: PetEntity, relations: { ... } },
 *         // one entry per unique entity class under this module
 *       ],
 *     },
 *     // one outer entry per distinct persistence adapter module
 *   ],
 * }
 * ```
 * Raw configs contribute nothing to `repositoryPersistence` — their entities
 * must be registered via `repositories.register` in the module options.
 */
export function aggregateResources(args: {
  readonly resources: ReadonlyArray<RocketsResourceInput>;
}): AggregatedResources {
  // ── Step 1: Partition inputs ──────────────────────────────────────────
  const bundles: RocketsResourceBundle[] = [];
  const rawConfigs: RocketsResourceConfig[] = [];

  for (const input of args.resources) {
    if (isRocketsResourceBundle(input)) {
      bundles.push(input);
    } else {
      rawConfigs.push(input);
    }
  }

  // ── Step 2: Derive persistence from bundles ───────────────────────────
  const byModule = new Map<
    RepositoryModuleInterface,
    Map<Type<PlainLiteralObject>, RepositoryProviderOptions>
  >();

  for (const bundle of bundles) {
    const module = bundle.persistence.module;
    const entityMap = byModule.get(module) ?? new Map();

    const entityClass = bundle.persistence.entity.entity;
    const existing = entityMap.get(entityClass);

    if (existing) {
      assertEntityConfigAgrees(
        existing,
        bundle.persistence.entity,
        bundle.meta.key,
      );
    } else {
      entityMap.set(entityClass, bundle.persistence.entity);
    }

    byModule.set(module, entityMap);
  }

  const repositoryPersistence: RepositoryPersistenceConfig[] = Array.from(
    byModule.entries(),
  ).map(([module, entityMap]) => ({
    module,
    entities: Array.from(entityMap.values()),
  }));

  // ── Step 3: Validate cross-resource relations ─────────────────────────
  const bundlesByKey = new Map<string, RocketsResourceBundle>();
  for (const bundle of bundles) {
    bundlesByKey.set(bundle.meta.key, bundle);
  }

  for (const bundle of bundles) {
    for (const relation of bundle.meta.relations) {
      if (!bundlesByKey.has(relation.target)) {
        const propertyName = relation.propertyName ?? relation.target;
        throw new Error(
          `aggregateResources[${bundle.meta.key}]: relation "${propertyName}" ` +
            `targets resource "${relation.target}" which is not registered ` +
            `in this RocketsModule. Check the \`target\` string matches ` +
            `another resource's \`key\`, and that the target resource is ` +
            `included in the \`resources[]\` option.`,
        );
      }
    }
  }

  // ── Step 4: Build output ──────────────────────────────────────────────
  const resources: RocketsResourceConfig[] = [
    ...bundles.map((b) => b.core),
    ...rawConfigs,
  ];

  return { resources, repositoryPersistence };
}

/**
 * Guard against a single entity class being registered twice with
 * conflicting persistence-layer config.
 */
function assertEntityConfigAgrees(
  existing: RepositoryProviderOptions,
  incoming: RepositoryProviderOptions,
  incomingKey: string,
): void {
  if (existing.key !== incoming.key) {
    throw new Error(
      `aggregateResources: entity "${existing.entity.name}" registered ` +
        `with conflicting keys — "${existing.key}" vs "${incoming.key}" ` +
        `(from resource "${incomingKey}"). Two resources sharing one ` +
        `entity must use the same persistence key.`,
    );
  }

  const existingRelations = JSON.stringify(existing.relations ?? {});
  const incomingRelations = JSON.stringify(incoming.relations ?? {});
  if (existingRelations !== incomingRelations) {
    throw new Error(
      `aggregateResources: entity "${existing.entity.name}" (key ` +
        `"${existing.key}") registered with conflicting \`relations\` ` +
        `config (from resource "${incomingKey}"). Two resources sharing ` +
        `one entity must declare identical relation configuration.`,
    );
  }
}
