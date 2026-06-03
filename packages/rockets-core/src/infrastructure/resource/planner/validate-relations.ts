import type { CrudResource } from '../../../domain/interfaces/rockets-resource-bundle.interface';
import { resolveRelationTarget } from '../relation';
import type { EntityRegistry } from './entity-registry';

export function validateResourceRelations(
  generatedResources: ReadonlyArray<CrudResource>,
  entityRegistry: EntityRegistry,
): void {
  for (const resource of generatedResources) {
    for (const relationEntry of resource.meta.relations) {
      const targetClass = resolveRelationTarget(relationEntry);
      if (!entityRegistry.has(targetClass)) {
        throw new Error(
          `buildAppRegistrationPlan[${resource.meta.key}]: relation "${relationEntry.propertyName}" ` +
            `targets entity \`${targetClass.name}\` which is not registered in this ` +
            `RocketsModule. Either declare a \`defineResource()\` resource for it, or ` +
            `add it to a \`defineModuleResource({ entities: [...] })\` bundle.`,
        );
      }
    }
  }
}
