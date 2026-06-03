import type { RelationActionConfig } from '@concepta/nestjs-repository';
import type { ResourceRelationEntry } from '../../../domain/interfaces/rockets-resource-definition.interface';

export function buildPersistenceRelations(
  relations: readonly ResourceRelationEntry[] | undefined,
): Record<string, RelationActionConfig> | undefined {
  if (!relations?.length) return undefined;
  const map: Record<string, RelationActionConfig> = {};
  for (const entry of relations) {
    const cfg: RelationActionConfig = {};
    if (entry.federated !== undefined) cfg.federated = entry.federated;
    if (entry.distinctFilter !== undefined)
      cfg.distinctFilter = entry.distinctFilter;
    if (Object.keys(cfg).length === 0) continue;
    map[entry.propertyName] = cfg;
  }
  return Object.keys(map).length ? map : undefined;
}
