import type { DynamicModule, PlainLiteralObject, Type } from '@nestjs/common';
import type { RepositoryBootstrap } from '../../domain/interfaces/repository-bootstrap.interface';
import type { AppRegistrationPlan } from '../resource/planner/app-registration-plan.types';
import { collectBootstrapForRootImports } from './collect-bootstrap-for-root-imports';

class WidgetEntity {
  id!: string;
}

class AnalyticsEntity {
  id!: string;
}

function createBootstrap(name: string): RepositoryBootstrap {
  return {
    name,
    forFeature: () => ({ module: class FeatureModule {} }),
    forRoot: jest.fn(
      (_entities: ReadonlyArray<Type<PlainLiteralObject>>): DynamicModule => ({
        module: class RootModule {},
      }),
    ),
  };
}

describe('collectBootstrapForRootImports', () => {
  it('returns empty when no bootstrap adapters appear in the plan', () => {
    const plan: AppRegistrationPlan = {
      crudResources: [],
      entityRegistrations: [
        {
          module: { name: 'plain', forFeature: jest.fn() },
          entities: [{ key: 'widget', entity: WidgetEntity }],
        },
      ],
      nestModules: [],
    };

    expect(collectBootstrapForRootImports(plan)).toEqual([]);
  });

  it('calls forRoot once per distinct bootstrap with its entity classes', () => {
    const sqlBootstrap = createBootstrap('sql');
    const firestoreBootstrap = createBootstrap('firestore');

    const plan: AppRegistrationPlan = {
      crudResources: [],
      entityRegistrations: [
        {
          module: sqlBootstrap,
          entities: [{ key: 'widget', entity: WidgetEntity }],
        },
        {
          module: firestoreBootstrap,
          entities: [{ key: 'analytics', entity: AnalyticsEntity }],
        },
      ],
      nestModules: [],
    };

    const imports = collectBootstrapForRootImports(plan);

    expect(imports).toHaveLength(2);
    expect(sqlBootstrap.forRoot).toHaveBeenCalledWith([WidgetEntity]);
    expect(firestoreBootstrap.forRoot).toHaveBeenCalledWith([AnalyticsEntity]);
  });

  it('merges entities that share the same bootstrap reference into one forRoot call', () => {
    const bootstrap = createBootstrap('shared');

    const plan: AppRegistrationPlan = {
      crudResources: [],
      entityRegistrations: [
        {
          module: bootstrap,
          entities: [{ key: 'widget', entity: WidgetEntity }],
        },
        {
          module: bootstrap,
          entities: [{ key: 'analytics', entity: AnalyticsEntity }],
        },
      ],
      nestModules: [],
    };

    collectBootstrapForRootImports(plan);

    expect(bootstrap.forRoot).toHaveBeenCalledTimes(1);
    expect(bootstrap.forRoot).toHaveBeenCalledWith([
      WidgetEntity,
      AnalyticsEntity,
    ]);
  });
});
