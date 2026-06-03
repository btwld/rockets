import type { EntityConstructor } from '../../../domain/interfaces/rockets-resource-definition.interface';
import type { CrudResource } from '../../../domain/interfaces/rockets-resource-bundle.interface';
import type { ModuleResource } from '../../../domain/interfaces/module-resource.interface';
import type { RocketsUserMetadataConfig } from '../../../domain/interfaces/rockets-user-metadata-config.interface';
import { USER_METADATA_MODULE_ENTITY_KEY } from '../../../rockets-core.constants';
import { throwOnDuplicateEntity } from './duplicate-entity.error';

export type EntityRegistry = ReadonlyMap<EntityConstructor, string>;

export function buildEntityRegistry(
  generatedResources: ReadonlyArray<CrudResource>,
  moduleBundles: ReadonlyArray<ModuleResource>,
  userMetadata: RocketsUserMetadataConfig | undefined,
): EntityRegistry {
  interface IndexEntry {
    readonly key: string;
    readonly origin: string;
  }

  const index = new Map<EntityConstructor, IndexEntry>();

  const register = (
    entityClass: EntityConstructor,
    key: string,
    origin: string,
  ): void => {
    const existing = index.get(entityClass);
    if (existing) {
      throwOnDuplicateEntity(entityClass.name, existing.origin, origin);
    }
    index.set(entityClass, { key, origin });
  };

  for (const resource of generatedResources) {
    register(
      resource.persistence.entity.entity,
      resource.meta.key,
      `defineResource(${resource.meta.key})`,
    );
  }

  for (const bundle of moduleBundles) {
    for (const entry of bundle.entities) {
      register(entry.entity, entry.key, `defineModuleResource(${entry.key})`);
    }
  }

  const userMetadataEntity = userMetadata?.entity;
  if (userMetadataEntity) {
    register(
      userMetadataEntity,
      USER_METADATA_MODULE_ENTITY_KEY,
      'extras.userMetadata',
    );
  }

  return new Map(
    Array.from(index.entries()).map(([entity, entry]) => [entity, entry.key]),
  );
}
