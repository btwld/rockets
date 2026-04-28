import type { PlainLiteralObject, Type } from '@nestjs/common';
import type {
  RepositoryModuleInterface,
  RepositoryProviderOptions,
} from '@concepta/nestjs-repository';
// The maps below are keyed by the *entity class* (the `class Foo {}` value), not
// a string. That matches how repository registration and relation targets work.
import type { RepositoryPersistenceConfig } from '../../domain/interfaces/repository-persistence.interface';
import type { RocketsResourceConfig } from '../../domain/interfaces/rockets-resource.interface';
import type { RocketsResourceBundle } from '../../domain/interfaces/rockets-resource-bundle.interface';
import type { RocketsRepositoriesConfig } from '../../domain/interfaces/rockets-repositories.interface';
import type { EntityConstructor } from '../../domain/interfaces/rockets-resource-definition.interface';
import { USER_METADATA_MODULE_ENTITY_KEY } from '../../rockets-core.constants';
import { resolveRelationTarget } from './relation';

/**
 * What the app needs in order to register a set of resources.
 *
 * - `resources`: the CRUD configs the module will import (`CrudModule.forFeature(...)`).
 *   This includes:
 *   - `defineResource()` “core” configs (auto-generated)
 *   - any manual `RocketsResourceConfig` the user built by hand
 *
 * - `repositoryPersistence`: the database table wiring Rockets should register
 *   (`RepositoryModule.forFeature(...)`), grouped by storage adapter.
 *   This only comes from `defineResource()`; manual resources do not add anything here.
 */
export interface ResourceRegistrationPlan {
  readonly resources: ReadonlyArray<RocketsResourceConfig>;
  readonly repositoryPersistence: ReadonlyArray<RepositoryPersistenceConfig>;
}

/**
 * A single item you can list under `RocketsCoreModule` extras: `resources`.
 *
 * You can mix:
 * - **Generated** resources: output of `defineResource(...)` (includes enough info to
 *   auto-register the entity and validate relations)
 * - **Manual** resources: a plain `RocketsResourceConfig` (you must register the entity
 *   yourself in `repositories.entities`, because Rockets can’t guess it)
 */
export type ResourceDefinitionInput<
  E extends PlainLiteralObject = PlainLiteralObject,
> = RocketsResourceBundle<E> | RocketsResourceConfig;

/**
 * Returns `true` when the item is a `defineResource()` return value (a bundle).
 * Manual items won’t have the `core` + `persistence` + `meta` parts.
 */
export function isGeneratedResourceDefinition(
  definition: ResourceDefinitionInput,
): definition is RocketsResourceBundle {
  return (
    typeof definition === 'object' &&
    definition !== null &&
    'core' in definition &&
    'persistence' in definition &&
    'meta' in definition
  );
}

/**
 * Turn a mixed `resources[]` into something Rockets can safely import.
 *
 * In plain terms:
 * - **Split** the list into generated (`defineResource`) vs manual (`RocketsResourceConfig`).
 * - **Remember** which entity class maps to which persistence `key` (and fail fast if
 *   the same class is registered twice with different keys — that’s almost always a bug).
 * - **Build** the repository `forFeature(...)` data from the generated side only.
 * - **Check** relations: every related entity must be registered somewhere in this app
 *   (either as another `defineResource()` entity, or in `repositories.entities`).
 * - **Return** the final CRUD configs (generated + manual) plus the repository wiring.
 *
 * @throws When a relation points at an entity that isn’t registered in this module.
 * @throws When the same entity class is registered with two different `key`s.
 * @throws When two resources share the same entity but disagree on relation wiring.
 */
export function prepareResourceRegistration(args: {
  readonly resourceDefinitions: ReadonlyArray<ResourceDefinitionInput>;
  readonly repositories?: RocketsRepositoriesConfig;
}): ResourceRegistrationPlan {
  // 1) Split: generated (defineResource) vs manual (plain RocketsResourceConfig)
  const generatedResources: RocketsResourceBundle[] = [];
  const manualResources: RocketsResourceConfig[] = [];

  for (const definition of args.resourceDefinitions) {
    if (isGeneratedResourceDefinition(definition)) {
      generatedResources.push(definition);
    } else {
      manualResources.push(definition);
    }
  }

  // 2) Remember every entity <-> key mapping the module knows about (generated
  //    resources, plus any extra entities the user listed in `repositories`).
  const entityIndex = buildEntityIndex(generatedResources, args.repositories);

  // 3) Create repository wiring from generated resources (manual resources skip this).
  const byModule = new Map<
    RepositoryModuleInterface,
    Map<Type<PlainLiteralObject>, RepositoryProviderOptions>
  >();

  // For each `defineResource()`:
  // - pick the storage adapter (`module` — e.g. TypeORM vs another backend)
  // - collect all entity registrations for that adapter in one place
  //
  // We also dedupe by *entity class*: two resources can’t claim the same table
  // with different `key` / relation metadata — that’s a hard startup error.
  for (const resource of generatedResources) {
    const module = resource.persistence.module;
    const entityMap = byModule.get(module) ?? new Map();

    const entityClass = resource.persistence.entity.entity;
    const existing = entityMap.get(entityClass);

    if (existing) {
      // If we’ve seen this class already, the two registrations must be identical
      // (same `key` + same repository `relations` map).
      assertEntityConfigAgrees(
        existing,
        resource.persistence.entity,
        resource.meta.key,
      );
    } else {
      // First time we see this entity class for this adapter — keep its repo config.
      entityMap.set(entityClass, resource.persistence.entity);
    }

    // `entityMap` might be the newly created Map — always store the latest one.
    byModule.set(module, entityMap);
  }

  const repositoryPersistence: RepositoryPersistenceConfig[] = Array.from(
    byModule.entries(),
  ).map(([module, entityMap]) => ({
    module,
    entities: Array.from(entityMap.values()),
  }));

  // 4) Validate relations (only the generated path carries `meta.relations` today).
  for (const resource of generatedResources) {
    for (const relation of resource.meta.relations) {
      const targetClass = resolveRelationTarget(relation);
      if (!entityIndex.has(targetClass)) {
        throw new Error(
          `prepareResourceRegistration[${resource.meta.key}]: relation "${relation.propertyName}" ` +
            `targets entity \`${targetClass.name}\` which is not registered in this ` +
            `RocketsModule. Either declare a \`defineResource()\` resource for it, or ` +
            `add it to \`repositories.entities\` so it carries a dynamic-repository key.`,
        );
      }
    }
  }

  // 5) Return CRUD configs (generated + manual) plus the repository plan.
  const resources: RocketsResourceConfig[] = [
    ...generatedResources.map((resource) => resource.core),
    ...manualResources,
  ];

  return { resources, repositoryPersistence };
}

/**
 * Build a map: `Entity class -> dynamic repository key`.
 *
 * This includes:
 * - every generated `defineResource()` resource
 * - the required `userMetadata` entity
 * - any extra entities the user added in `repositories.entities`
 */
function buildEntityIndex(
  generatedResources: ReadonlyArray<RocketsResourceBundle>,
  repositories: RocketsRepositoriesConfig | undefined,
): Map<EntityConstructor, string> {
  // The map key is the entity class (not a string name), so we can compare classes safely.
  const index = new Map<EntityConstructor, string>();

  const register = (
    entityClass: EntityConstructor,
    key: string,
    origin: string,
  ): void => {
    const existing = index.get(entityClass);
    if (existing !== undefined && existing !== key) {
      throw new Error(
        `prepareResourceRegistration: entity \`${entityClass.name}\` is registered ` +
          `under conflicting keys — "${existing}" and "${key}" (from ${origin}). ` +
          `Each entity class must map to exactly one persistence key across ` +
          `\`defineResource()\` resources and \`repositories.entities\`.`,
      );
    }
    index.set(entityClass, key);
  };

  for (const resource of generatedResources) {
    register(
      resource.persistence.entity.entity,
      resource.meta.key,
      `defineResource[${resource.meta.key}]`,
    );
  }

  if (repositories) {
    // `userMetadata` is always part of the unified `repositories` config and uses a
    // stable key, so relations can point at it like any other entity.
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
 * If two `defineResource()` calls end up on the same entity, they must agree
 * (same key, same repository relation config). If not, fail loudly during startup.
 */
function assertEntityConfigAgrees(
  existing: RepositoryProviderOptions,
  incoming: RepositoryProviderOptions,
  incomingKey: string,
): void {
  if (existing.key !== incoming.key) {
    throw new Error(
      `prepareResourceRegistration: entity "${existing.entity.name}" registered ` +
        `with conflicting keys — "${existing.key}" vs "${incoming.key}" ` +
        `(from resource "${incomingKey}"). Two resources sharing one ` +
        `entity must use the same persistence key.`,
    );
  }

  const existingRelations = JSON.stringify(existing.relations ?? {});
  const incomingRelations = JSON.stringify(incoming.relations ?? {});
  if (existingRelations !== incomingRelations) {
    throw new Error(
      `prepareResourceRegistration: entity "${existing.entity.name}" (key ` +
        `"${existing.key}") registered with conflicting \`relations\` ` +
        `config (from resource "${incomingKey}"). Two resources sharing ` +
        `one entity must declare identical relation configuration.`,
    );
  }
}
