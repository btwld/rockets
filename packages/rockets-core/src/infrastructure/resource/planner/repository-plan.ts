import type { PlainLiteralObject, Type } from '@nestjs/common';
import type {
  RepositoryModuleInterface,
  RepositoryProviderOptions,
} from '@bitwild/rockets-repository';
import type { RepositoryPersistenceConfig } from '../../../domain/interfaces/repository-persistence.interface';
import type { CrudResource } from '../../../domain/interfaces/rockets-resource-bundle.interface';
import type { ModuleResource } from '../../../domain/interfaces/module-resource.interface';
import type { RocketsUserMetadataConfig } from '../../../domain/interfaces/rockets-user-metadata-config.interface';
import { USER_METADATA_MODULE_ENTITY_KEY } from '../../../rockets-core.constants';
import { throwOnDuplicateEntity } from './duplicate-entity.error';
import { resolvePersistenceAdapter } from './resolve-persistence-adapter';

interface RegisteredRow {
  readonly row: RepositoryProviderOptions;
  readonly origin: string;
}

export class PersistenceRegistry {
  private readonly byAdapter = new Map<
    RepositoryModuleInterface,
    Map<Type<PlainLiteralObject>, RegisteredRow>
  >();

  registerRow(
    adapter: RepositoryModuleInterface,
    entityClass: Type<PlainLiteralObject>,
    row: RepositoryProviderOptions,
    origin: string,
  ): void {
    const adapterMap = this.byAdapter.get(adapter) ?? new Map();
    const existing = adapterMap.get(entityClass);

    if (existing) {
      throwOnDuplicateEntity(entityClass.name, existing.origin, origin);
    }

    adapterMap.set(entityClass, { row, origin });
    this.byAdapter.set(adapter, adapterMap);
  }

  toEntityRegistrations(): RepositoryPersistenceConfig[] {
    return Array.from(this.byAdapter.entries()).map(([module, entityMap]) => ({
      module,
      entities: Array.from(entityMap.values()).map((entry) => entry.row),
    }));
  }
}

export function buildRepositoryPlan(args: {
  readonly generatedResources: ReadonlyArray<CrudResource>;
  readonly moduleBundles: ReadonlyArray<ModuleResource>;
  readonly userMetadata: RocketsUserMetadataConfig | undefined;
  readonly rootAdapter: RepositoryModuleInterface | undefined;
}): RepositoryPersistenceConfig[] {
  const registry = new PersistenceRegistry();

  for (const resource of args.generatedResources) {
    const origin = `defineResource(${resource.meta.key})`;
    const adapter = resolvePersistenceAdapter(
      resource.persistence.module,
      args.rootAdapter,
      origin,
    );
    registry.registerRow(
      adapter,
      resource.persistence.entity.entity,
      resource.persistence.entity,
      origin,
    );
  }

  for (const bundle of args.moduleBundles) {
    for (const entry of bundle.entities) {
      const origin = `defineModuleResource(${entry.key})`;
      const adapter = resolvePersistenceAdapter(
        entry.repository,
        args.rootAdapter,
        `module resource entity "${entry.key}" (${entry.entity.name})`,
      );
      registry.registerRow(
        adapter,
        entry.entity,
        {
          key: entry.key,
          entity: entry.entity,
          ...(entry.collection !== undefined
            ? { collection: entry.collection }
            : {}),
        },
        origin,
      );
    }
  }

  if (args.userMetadata?.entity) {
    const adapter = resolvePersistenceAdapter(
      args.userMetadata.repository,
      args.rootAdapter,
      'extras.userMetadata',
    );
    registry.registerRow(
      adapter,
      args.userMetadata.entity as Type<PlainLiteralObject>,
      {
        key: USER_METADATA_MODULE_ENTITY_KEY,
        entity: args.userMetadata.entity as Type<PlainLiteralObject>,
      },
      'extras.userMetadata',
    );
  }

  return registry.toEntityRegistrations();
}
