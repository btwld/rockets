import type { PlainLiteralObject, Type } from '@nestjs/common';
import type {
  RepositoryModuleInterface,
  RepositoryProviderOptions,
} from '@concepta/nestjs-repository';
// `Type<PlainLiteralObject>` is the per-entity persistence map key (kept
// for `byModule` because RepositoryProviderOptions stores `Type<E>`).
import type { RepositoryPersistenceConfig } from '../../domain/interfaces/repository-persistence.interface';
import type { RocketsResourceConfig } from '../../domain/interfaces/rockets-resource.interface';
import type { RocketsResourceBundle } from '../../domain/interfaces/rockets-resource-bundle.interface';
import type { RocketsRepositoriesConfig } from '../../domain/interfaces/rockets-repositories.interface';
import type { EntityConstructor } from '../../domain/interfaces/rockets-resource-definition.interface';
import { USER_METADATA_MODULE_ENTITY_KEY } from '../../rockets-core.constants';
import { resolveRelationTarget } from './relation';

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
 * `repositories.entities` in the module options).
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
 * ## Algorithm
 *
 * 1. **Partition** bundles from raw configs.
 * 2. **Index entity → key** across both bundles and `repositories.entities`,
 *    enforcing the single-key invariant: an entity class cannot be registered
 *    under two different keys.
 * 3. **Derive persistence** from bundles, grouping by adapter module and
 *    deduplicating identical entity registrations.
 * 4. **Validate cross-resource relations** — every `relation.target` class
 *    must resolve to a known entity in the index built in step 2. The target
 *    may live in another bundle *or* in a `repositories.entities` entry,
 *    making non-CRUD entities (junction tables, lookup tables) valid relation
 *    targets without forcing a controller surface on them.
 * 5. **Build output** — `{ resources, repositoryPersistence }`.
 *
 * @throws When the same entity class is registered under conflicting keys.
 * @throws When a relation target cannot be resolved to a registered entity.
 * @throws When two bundles register the same entity with different relation config.
 */
export function aggregateResources(args: {
  readonly resources: ReadonlyArray<RocketsResourceInput>;
  readonly repositories?: RocketsRepositoriesConfig;
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

  // ── Step 2: Index entity classes → resource keys ──────────────────────
  // Bundles + repositories.entities (+ userMetadata) all contribute. The
  // single-key invariant catches the case where the same entity class
  // shows up under two different `key` strings — the resulting dynamic
  // repository tokens would silently collide.
  const entityIndex = buildEntityIndex(bundles, args.repositories);

  // ── Step 3: Derive persistence from bundles ───────────────────────────
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

  // ── Step 4: Validate cross-resource relations ─────────────────────────
  for (const bundle of bundles) {
    for (const relation of bundle.meta.relations) {
      const targetClass = resolveRelationTarget(relation);
      if (!entityIndex.has(targetClass)) {
        throw new Error(
          `aggregateResources[${bundle.meta.key}]: relation "${relation.propertyName}" ` +
            `targets entity \`${targetClass.name}\` which is not registered in this ` +
            `RocketsModule. Either declare a \`defineResource()\` bundle for it, or ` +
            `add it to \`repositories.entities\` so it carries a dynamic-repository key.`,
        );
      }
    }
  }

  // ── Step 5: Build output ──────────────────────────────────────────────
  const resources: RocketsResourceConfig[] = [
    ...bundles.map((b) => b.core),
    ...rawConfigs,
  ];

  return { resources, repositoryPersistence };
}

/**
 * Build a `class -> registered key` index across every entity the module
 * knows about: `defineResource()` bundles plus `repositories.entities`
 * (plus `userMetadata`). Throws on the single-key invariant violation
 * (same class registered under two distinct keys).
 */
function buildEntityIndex(
  bundles: ReadonlyArray<RocketsResourceBundle>,
  repositories: RocketsRepositoriesConfig | undefined,
): Map<EntityConstructor, string> {
  // Keyed by `EntityConstructor` so both Nest's `Type<X>` (from bundle
  // persistence and repositories.entities) and `EntityConstructor<unknown>`
  // (returned by `resolveRelationTarget()`) flow through without variance
  // casts. The map is used purely for identity comparison; we never
  // instantiate keys.
  const index = new Map<EntityConstructor, string>();

  const register = (
    entityClass: EntityConstructor,
    key: string,
    origin: string,
  ): void => {
    const existing = index.get(entityClass);
    if (existing !== undefined && existing !== key) {
      throw new Error(
        `aggregateResources: entity \`${entityClass.name}\` is registered ` +
          `under conflicting keys — "${existing}" and "${key}" (from ${origin}). ` +
          `Each entity class must map to exactly one persistence key across ` +
          `\`defineResource()\` bundles and \`repositories.entities\`.`,
      );
    }
    index.set(entityClass, key);
  };

  for (const bundle of bundles) {
    register(
      bundle.persistence.entity.entity,
      bundle.meta.key,
      `defineResource[${bundle.meta.key}]`,
    );
  }

  if (repositories) {
    // userMetadata is registered with the conventional 'userMetadata' key by
    // flattenRepositories(). We mirror that here so a relation may target it.
    register(
      repositories.userMetadata.entity,
      USER_METADATA_MODULE_ENTITY_KEY,
      `repositories.userMetadata`,
    );
    for (const entry of repositories.entities ?? []) {
      register(entry.entity, entry.key, `repositories.entities[${entry.key}]`);
    }
  }

  return index;
}

/**
 * Guard against a single entity class being registered twice with
 * conflicting persistence-layer config inside the bundle set.
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
