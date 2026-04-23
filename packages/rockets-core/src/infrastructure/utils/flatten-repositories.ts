import type { PlainLiteralObject } from '@nestjs/common';
import type {
  RepositoryModuleInterface,
  RepositoryProviderOptions,
} from '@concepta/nestjs-repository';
import type { RepositoryPersistenceConfig } from '../../domain/interfaces/repository-persistence.interface';
import type { RocketsRepositoriesConfig } from '../../domain/interfaces/rockets-repositories.interface';
import { USER_METADATA_MODULE_ENTITY_KEY } from '../../rockets-core.constants';

/**
 * Convert a `RocketsRepositoriesConfig` into the flat
 * `RepositoryPersistenceConfig[]` that `RepositoryModule.forFeature()` expects.
 *
 * Entries are grouped by their effective module (entry-level override or
 * the root default). Each group produces one `forFeature()` call.
 */
export function flattenRepositories(
  config: RocketsRepositoriesConfig,
): RepositoryPersistenceConfig[] {
  const defaultModule = config.module;

  const byModule = new Map<
    RepositoryModuleInterface,
    RepositoryProviderOptions<PlainLiteralObject>[]
  >();

  function addEntry(
    module: RepositoryModuleInterface,
    entry: RepositoryProviderOptions<PlainLiteralObject>,
  ): void {
    const list = byModule.get(module) ?? [];
    list.push(entry);
    byModule.set(module, list);
  }

  // userMetadata — always registered
  addEntry(config.userMetadata.module ?? defaultModule, {
    key: USER_METADATA_MODULE_ENTITY_KEY,
    entity: config.userMetadata.entity,
  });

  // Additional register entries
  for (const entry of config.entities ?? []) {
    addEntry(entry.module ?? defaultModule, {
      key: entry.key,
      entity: entry.entity,
    });
  }

  return Array.from(byModule.entries()).map(([module, entities]) => ({
    module,
    entities,
  }));
}
