import { TypeOrmRepositoryModule } from '@concepta/nestjs-repository-typeorm';
import type { RepositoryModuleInterface } from '@concepta/nestjs-repository';
import {
  defineModuleResource,
  isModuleResource,
} from './define-module-resource';
import {
  buildAppRegistrationPlan,
  isCrudResource,
} from './aggregate-resources';
import { defineResource } from './define-resource';
import { relation } from './relation';
import { ResourceKind } from '../../domain/interfaces/resource-kind.enum';

class WidgetEntity {
  id!: string;
}

class GadgetEntity {
  id!: string;
}

class WidgetService {}
class WidgetController {}

const FakeAlternateAdapter = {
  name: 'FakeAlternateAdapter',
  forFeature: () => ({ module: class {} }),
} as unknown as RepositoryModuleInterface;

describe('defineModuleResource', () => {
  it('returns a branded bundle with provided entities + module slice', () => {
    const bundle = defineModuleResource({
      entities: [{ key: 'widget', entity: WidgetEntity }],
      controllers: [WidgetController],
      providers: [WidgetService],
      exports: [WidgetService],
    });

    expect(bundle.kind).toBe(ResourceKind.Module);
    expect(bundle.entities).toHaveLength(1);
    expect(bundle.entities[0]).toEqual({
      key: 'widget',
      entity: WidgetEntity,
    });
    expect(bundle.controllers).toEqual([WidgetController]);
    expect(bundle.providers).toEqual([WidgetService]);
    expect(bundle.exports).toEqual([WidgetService]);
  });

  it('defaults entities to an empty array when omitted', () => {
    const bundle = defineModuleResource({});
    expect(bundle.entities).toEqual([]);
  });

  describe('entities[] class shorthand', () => {
    class UserEntity {
      id!: string;
    }
    class PetTagEntity {
      id!: string;
    }
    class Order {
      id!: string;
    }

    it('derives the key by stripping `Entity` and lowercasing the first char', () => {
      const bundle = defineModuleResource({
        entities: [UserEntity, PetTagEntity, Order],
      });
      expect(bundle.entities).toEqual([
        { key: 'user', entity: UserEntity },
        { key: 'petTag', entity: PetTagEntity },
        { key: 'order', entity: Order },
      ]);
    });

    it('preserves the explicit `{ key, entity }` form alongside shorthand', () => {
      const FakeAdapter = {
        name: 'X',
        forFeature: () => ({ module: class {} }),
      } as unknown as RepositoryModuleInterface;
      const bundle = defineModuleResource({
        entities: [
          UserEntity,
          { key: 'custom', entity: PetTagEntity, repository: FakeAdapter },
        ],
      });
      expect(bundle.entities).toEqual([
        { key: 'user', entity: UserEntity },
        { key: 'custom', entity: PetTagEntity, repository: FakeAdapter },
      ]);
    });
  });

  it('isModuleResource distinguishes bundles from CRUD bundles and plain configs', () => {
    const featureBundle = defineModuleResource({});
    const crudBundle = defineResource({
      key: 'widget',
      path: 'widgets',
      tags: ['widgets'],
      entity: WidgetEntity,
    });
    const manualConfig = {
      crud: { controller: { path: 'x', entity: 'x' }, operations: [] },
    };

    expect(isModuleResource(featureBundle)).toBe(true);
    expect(isModuleResource(crudBundle)).toBe(false);
    expect(isModuleResource(manualConfig)).toBe(false);
    expect(isModuleResource(null)).toBe(false);
    expect(isModuleResource(undefined)).toBe(false);
    expect(isModuleResource('not-a-bundle')).toBe(false);

    expect(isCrudResource(featureBundle)).toBe(false);
    expect(isCrudResource(crudBundle)).toBe(true);
  });

  it('isModuleResource rejects an object with a wrong `kind` discriminator', () => {
    expect(isModuleResource({ kind: ResourceKind.Crud })).toBe(false);
    expect(isModuleResource({ kind: ResourceKind.Sub })).toBe(false);
    expect(isModuleResource({ kind: 'something-else' })).toBe(false);
  });

  it('isModuleResource rejects look-alike objects without the discriminator', () => {
    const lookalike = { entities: [], controllers: [], providers: [] };
    expect(isModuleResource(lookalike)).toBe(false);
  });

  it('the defineModuleResource() output carries the correct kind discriminator', () => {
    const bundle = defineModuleResource({});
    expect(bundle.kind).toBe(ResourceKind.Module);
  });
});

describe('buildAppRegistrationPlan with defineModuleResource', () => {
  it('folds bundle entities into the repository persistence plan under the root adapter', () => {
    const bundle = defineModuleResource({
      entities: [{ key: 'widget', entity: WidgetEntity }],
    });

    const plan = buildAppRegistrationPlan({
      resources: [bundle],
      repository: TypeOrmRepositoryModule,
    });

    expect(plan.entityRegistrations).toHaveLength(1);
    expect(plan.entityRegistrations[0].module).toBe(TypeOrmRepositoryModule);
    expect(plan.entityRegistrations[0].entities).toEqual([
      { key: 'widget', entity: WidgetEntity },
    ]);
  });

  it('honors per-entity adapter override and groups separately from root adapter', () => {
    const bundle = defineModuleResource({
      entities: [
        { key: 'widget', entity: WidgetEntity },
        {
          key: 'gadget',
          entity: GadgetEntity,
          repository: FakeAlternateAdapter,
        },
      ],
    });

    const plan = buildAppRegistrationPlan({
      resources: [bundle],
      repository: TypeOrmRepositoryModule,
    });

    expect(plan.entityRegistrations).toHaveLength(2);
    const root = plan.entityRegistrations.find(
      (p) => p.module === TypeOrmRepositoryModule,
    );
    const alternate = plan.entityRegistrations.find(
      (p) => p.module === FakeAlternateAdapter,
    );
    expect(root?.entities).toEqual([{ key: 'widget', entity: WidgetEntity }]);
    expect(alternate?.entities).toEqual([
      { key: 'gadget', entity: GadgetEntity },
    ]);
  });

  it('throws when a module resource entity has no adapter (no per-entity, no root)', () => {
    const bundle = defineModuleResource({
      entities: [{ key: 'widget', entity: WidgetEntity }],
    });

    expect(() => buildAppRegistrationPlan({ resources: [bundle] })).toThrow(
      /has no adapter/,
    );
  });

  it('allows-empty-entities mode (CQRS-only feature)', () => {
    const bundle = defineModuleResource({
      entities: [],
      controllers: [WidgetController],
      providers: [WidgetService],
    });

    const plan = buildAppRegistrationPlan({
      resources: [bundle],
    });

    expect(plan.entityRegistrations).toEqual([]);
    expect(plan.nestModules).toHaveLength(1);
    expect(plan.nestModules[0].controllers).toEqual([WidgetController]);
    expect(plan.nestModules[0].providers).toEqual([WidgetService]);
  });

  it('materializes the bundle slice into a Nest DynamicModule', () => {
    const bundle = defineModuleResource({
      entities: [{ key: 'widget', entity: WidgetEntity }],
      controllers: [WidgetController],
      providers: [WidgetService],
      exports: [WidgetService],
    });

    const plan = buildAppRegistrationPlan({
      resources: [bundle],
      repository: TypeOrmRepositoryModule,
    });

    expect(plan.nestModules).toHaveLength(1);
    const nestModule = plan.nestModules[0];
    expect(nestModule.module.name).toBe('RocketsModuleResource');
    expect(nestModule.controllers).toEqual([WidgetController]);
    expect(nestModule.providers).toEqual([WidgetService]);
    expect(nestModule.exports).toEqual([WidgetService]);
  });

  it('rejects entity-class registration conflict between bundles', () => {
    const a = defineModuleResource({
      entities: [{ key: 'widget', entity: WidgetEntity }],
    });
    const b = defineModuleResource({
      entities: [{ key: 'gadget', entity: WidgetEntity }],
    });

    expect(() =>
      buildAppRegistrationPlan({
        resources: [a, b],
        repository: TypeOrmRepositoryModule,
      }),
    ).toThrow(/registered twice/);
  });

  it('lets a CRUD relation point at an entity owned by a module resource', () => {
    class OwnerEntity {
      id!: string;
    }
    class PetEntity {
      id!: string;
      owner?: OwnerEntity;
    }

    const pet = defineResource({
      key: 'pet',
      path: 'pets',
      tags: ['pets'],
      entity: PetEntity,
      relations: [relation(PetEntity, OwnerEntity, 'owner')],
    });
    const ownerFeature = defineModuleResource({
      entities: [{ key: 'owner', entity: OwnerEntity }],
    });

    expect(() =>
      buildAppRegistrationPlan({
        resources: [pet, ownerFeature],
        repository: TypeOrmRepositoryModule,
      }),
    ).not.toThrow();
  });
});
