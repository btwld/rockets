import type { DynamicModule, PlainLiteralObject } from '@nestjs/common';
import type { RepositoryPersistenceConfig } from '../../../domain/interfaces/repository-persistence.interface';
import type { RocketsResourceConfig } from '../../../domain/interfaces/rockets-resource.interface';
import type { CrudResource } from '../../../domain/interfaces/rockets-resource-bundle.interface';
import type { ModuleResource } from '../../../domain/interfaces/module-resource.interface';
import { ResourceKind } from '../../../domain/interfaces/resource-kind.enum';

export interface AppRegistrationPlan {
  readonly crudResources: ReadonlyArray<RocketsResourceConfig>;
  readonly entityRegistrations: ReadonlyArray<RepositoryPersistenceConfig>;
  readonly nestModules: ReadonlyArray<DynamicModule>;
}

export type ResourceInput<E extends PlainLiteralObject = PlainLiteralObject> =
  | CrudResource<E>
  | ModuleResource
  | RocketsResourceConfig;

export function isCrudResource(value: unknown): value is CrudResource {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    value.kind === ResourceKind.Crud
  );
}

export interface SortedResourceInputs {
  readonly generatedResources: ReadonlyArray<CrudResource>;
  readonly moduleBundles: ReadonlyArray<ModuleResource>;
  readonly manualResources: ReadonlyArray<RocketsResourceConfig>;
}
