import type { DynamicModule, PlainLiteralObject, Type } from '@nestjs/common';

import type { RepositoryBootstrap } from '../../domain/interfaces/repository-bootstrap.interface';
import { isRepositoryBootstrap } from '../../domain/interfaces/repository-bootstrap.interface';
import type { AppRegistrationPlan } from '../resource/planner/app-registration-plan.types';

/**
 * Call `forRoot` once per distinct {@link RepositoryBootstrap} adapter that
 * owns entities in the registration plan — root adapter and per-entity
 * overrides alike (mixed-store apps with SQL root + Firestore override).
 */
export function collectBootstrapForRootImports(
  plan: AppRegistrationPlan,
): DynamicModule[] {
  const entitiesByBootstrap = new Map<
    RepositoryBootstrap,
    Type<PlainLiteralObject>[]
  >();

  for (const entry of plan.entityRegistrations) {
    if (!isRepositoryBootstrap(entry.module)) {
      continue;
    }
    const existing = entitiesByBootstrap.get(entry.module) ?? [];
    entitiesByBootstrap.set(entry.module, [
      ...existing,
      ...entry.entities.map((row) => row.entity),
    ]);
  }

  return Array.from(entitiesByBootstrap.entries()).map(([bootstrap, entities]) =>
    bootstrap.forRoot(entities),
  );
}
