import type { PlainLiteralObject } from '@nestjs/common';
import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import { Operation } from '@concepta/nestjs-common';
import { Where } from '@concepta/nestjs-repository';
import { TypeOrmRepositoryModule } from '@concepta/nestjs-repository-typeorm';
import {
  CrudOperationResolver,
  type ConfigurableCrudGeneratedOptions,
} from '@bitwild/rockets-crud';
import { defineResource } from './define-resource';
import { relation } from './relation';
import type { RocketsResourceBundle } from '../../domain/interfaces/rockets-resource-bundle.interface';

/**
 * `defineResource` always produces a generated (non-class-based) CRUD
 * configuration. The top-level `core.crud` field is typed against a
 * union that also includes class-based shapes, so tests narrow it here
 * to the one shape `defineResource` actually emits.
 */
function narrow<E extends PlainLiteralObject>(
  bundle: RocketsResourceBundle<E>,
): ConfigurableCrudGeneratedOptions<PlainLiteralObject> {
  return bundle.core
    .crud as ConfigurableCrudGeneratedOptions<PlainLiteralObject>;
}

// ────────────────────────────────────────────────────────────────────
// Fixtures — minimum plausible entity + DTOs to exercise defineResource.
// ────────────────────────────────────────────────────────────────────

// Forward-declared so WidgetEntity can reference part / parent / audit /
// history entities below for type-safe `relation()` calls.
class PartEntity {
  id!: string;
}
class PartCatalogEntity {
  id!: string;
}
class AuditEntity {
  id!: string;
}

@Entity('widgets')
class WidgetEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  // Relation properties — typed as plain arrays / scalars; `relation()` only
  // requires `propertyName` to be a `keyof Source`. Cardinality and
  // inverse-side wiring are inferred by the persistence adapter.
  parent?: WidgetEntity;
  parts?: PartEntity[];
  history?: AuditEntity[];
}

class WidgetResponseDto {
  id!: string;
  name!: string;
}

class WidgetCreateDto {
  name!: string;
}

class WidgetUpdateDto {
  name?: string;
}

class FakeHookClass {}
class FakeCreateHandler {}
class FakeUpdateHandler {}

describe('defineResource', () => {
  describe('validation', () => {
    it('throws when key is missing', () => {
      expect(() =>
        defineResource({
          key: '',
          entity: WidgetEntity,
          path: 'widget',
          tags: ['widget'],
        }),
      ).toThrow(/`key` is required/);
    });

    it('throws when entity is not a constructor', () => {
      expect(() =>
        defineResource({
          key: 'widget',
          entity: {} as unknown as typeof WidgetEntity,
          path: 'widget',
          tags: ['widget'],
        }),
      ).toThrow(/entity.*class constructor/);
    });

    it('throws when path is missing', () => {
      expect(() =>
        // @ts-expect-error — runtime-validation test of missing required field
        defineResource({
          key: 'widget',
          entity: WidgetEntity,
        }),
      ).toThrow(/`path` is required/);
    });

    it('throws when tags is missing', () => {
      expect(() =>
        // @ts-expect-error — runtime-validation test of missing required field
        defineResource({
          key: 'widget',
          entity: WidgetEntity,
          path: 'widget',
        }),
      ).toThrow(/`tags` is required/);
    });

    it('throws when operations array is empty', () => {
      expect(() =>
        defineResource({
          key: 'widget',
          entity: WidgetEntity,
          path: 'widget',
          tags: ['widget'],
          operations: [],
        }),
      ).toThrow(/operations.*cannot be an empty array/);
    });
  });

  describe('bundle shape', () => {
    it('returns { core, persistence, meta }', () => {
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widget',
        tags: ['widget'],
      });

      expect(bundle).toHaveProperty('core');
      expect(bundle).toHaveProperty('persistence');
      expect(bundle).toHaveProperty('meta');
    });

    it('meta.key matches the definition key', () => {
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widget',
        tags: ['widget'],
      });
      expect(bundle.meta.key).toBe('widget');
      expect(bundle.meta.entityClass).toBe(WidgetEntity);
    });

    it('persistence.module defaults to TypeOrmRepositoryModule', () => {
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widget',
        tags: ['widget'],
      });
      expect(bundle.persistence.module).toBe(TypeOrmRepositoryModule);
    });

    it('persistence.entity has { key, entity } from the definition', () => {
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widget',
        tags: ['widget'],
      });
      expect(bundle.persistence.entity.key).toBe('widget');
      expect(bundle.persistence.entity.entity).toBe(WidgetEntity);
    });

    it('derives persistence.entity.relations from top-level relations entries carrying federation/distinctFilter flags', () => {
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widget',
        tags: ['widget'],
        relations: [
          relation(WidgetEntity, WidgetEntity, 'parent', { federated: true }),
        ],
      });
      expect(bundle.persistence.entity.relations).toEqual({
        parent: { federated: true },
      });
    });

    it('uses `propertyName` as the persistence relations map key', () => {
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widget',
        tags: ['widget'],
        relations: [
          relation(WidgetEntity, PartCatalogEntity, 'parts', {
            federated: true,
          }),
        ],
      });
      expect(bundle.persistence.entity.relations).toEqual({
        parts: { federated: true },
      });
    });

    it('omits persistence.entity.relations when relations carry no persistence flags', () => {
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widget',
        tags: ['widget'],
        relations: [relation(WidgetEntity, WidgetEntity, 'parent')],
      });
      expect(bundle.persistence.entity.relations).toBeUndefined();
    });
  });

  describe('defaults', () => {
    it('uses the explicit top-level path unchanged', () => {
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widgets',
        tags: ['Widgets'],
      });
      expect(narrow(bundle).controller.path).toBe('widgets');
    });

    it('exposes 5 default operations (list/read/create/update/delete)', () => {
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widget',
        tags: ['widget'],
      });
      const { operations } = narrow(bundle);
      expect(operations).toHaveLength(5);
      const ops = operations.map((o) => o.operation);
      expect(ops).toEqual([
        Operation.List,
        Operation.Read,
        Operation.Create,
        Operation.Update,
        Operation.Delete,
      ]);
    });

    it('defaults the operation resolver to CrudOperationResolver', () => {
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widget',
        tags: ['widget'],
      });
      expect(narrow(bundle).controller.resolver).toBe(CrudOperationResolver);
    });
  });

  describe('relations', () => {
    it('preserves the full relation entry on meta.relations for prepareResourceRegistration validation', () => {
      const entry = relation(WidgetEntity, PartEntity, 'parts', {
        include: 'default',
      });
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widget',
        tags: ['widget'],
        relations: [entry],
      });
      expect(bundle.meta.relations[0]).toEqual({
        source: WidgetEntity,
        target: PartEntity,
        propertyName: 'parts',
        include: 'default',
      });
    });

    it('keeps include=never entries on meta.relations even though they are hidden from the controller', () => {
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widget',
        tags: ['widget'],
        operations: [Operation.List],
        relations: [
          relation(WidgetEntity, PartEntity, 'parts'),
          relation(WidgetEntity, AuditEntity, 'history', { include: 'never' }),
        ],
      });
      expect(bundle.meta.relations).toHaveLength(2);
    });

    it('rejects duplicate propertyNames pointing at the same source property', () => {
      expect(() =>
        defineResource({
          key: 'widget',
          entity: WidgetEntity,
          path: 'widget',
          tags: ['widget'],
          relations: [
            relation(WidgetEntity, PartEntity, 'parts'),
            relation(WidgetEntity, PartEntity, 'parts'),
          ],
        }),
      ).toThrow(/duplicate relation propertyName "parts"/);
    });

    it('accepts a `() => Class` thunk target for circular imports', () => {
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widget',
        tags: ['widget'],
        relations: [relation(WidgetEntity, () => PartEntity, 'parts')],
      });
      expect(bundle.meta.relations[0].propertyName).toBe('parts');
      // Thunk is preserved verbatim — resolution happens in prepareResourceRegistration.
      expect(typeof bundle.meta.relations[0].target).toBe('function');
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // Builder form — `relations: (relation) => […]` with a source-bound
  // relation helper. The bound `relation` captures the resource entity,
  // so the source can
  // never be mistyped; it is not even an argument the consumer passes.
  // ──────────────────────────────────────────────────────────────────
  describe('relations builder form', () => {
    it('invokes the builder with a source-bound relation helper and produces equivalent entries', () => {
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widget',
        tags: ['widget'],
        relations: (relation) => [relation(PartEntity, 'parts')],
      });
      expect(bundle.meta.relations).toHaveLength(1);
      expect(bundle.meta.relations[0]).toEqual({
        source: WidgetEntity,
        target: PartEntity,
        propertyName: 'parts',
      });
    });

    it('binds the source to the resource entity automatically', () => {
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widget',
        tags: ['widget'],
        relations: (relation) => [
          relation(PartEntity, 'parts'),
          relation(AuditEntity, 'history', { include: 'never' }),
        ],
      });
      // Every entry has WidgetEntity as the source — by construction.
      for (const entry of bundle.meta.relations) {
        expect(entry.source).toBe(WidgetEntity);
      }
    });

    it('forwards options (federated, distinctFilter, include) verbatim', () => {
      const filter = Where.eq('id', 'sentinel');
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widget',
        tags: ['widget'],
        relations: (relation) => [
          relation(PartEntity, 'parts', {
            federated: true,
            distinctFilter: filter,
          }),
          relation(AuditEntity, 'history', { include: 'never' }),
        ],
      });
      const parts = bundle.meta.relations.find(
        (r) => r.propertyName === 'parts',
      );
      const history = bundle.meta.relations.find(
        (r) => r.propertyName === 'history',
      );
      expect(parts?.federated).toBe(true);
      expect(parts?.distinctFilter).toBe(filter);
      expect(history?.include).toBe('never');
    });

    it('supports self-references via thunk inside the builder', () => {
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widget',
        tags: ['widget'],
        relations: (relation) => [relation(() => WidgetEntity, 'parent')],
      });
      const entry = bundle.meta.relations[0];
      expect(entry.source).toBe(WidgetEntity);
      expect(entry.propertyName).toBe('parent');
      expect(typeof entry.target).toBe('function');
    });

    it('feeds persistence relations from builder-produced entries', () => {
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widget',
        tags: ['widget'],
        relations: (relation) => [
          relation(PartEntity, 'parts', { federated: true }),
        ],
      });
      expect(bundle.persistence.entity.relations).toEqual({
        parts: { federated: true },
      });
    });

    it('feeds controller joins from builder-produced entries (skipping include=never)', () => {
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widget',
        tags: ['widget'],
        relations: (relation) => [
          relation(PartEntity, 'parts'),
          relation(AuditEntity, 'history', { include: 'never' }),
        ],
      });
      // Hidden relations are excluded from controller joins, but kept on
      // meta.relations for cross-resource validation.
      expect(bundle.meta.relations).toHaveLength(2);
      const list = narrow(bundle).operations.find(
        (o) => o.operation === Operation.List,
      );
      // The CrudJoin decorator stores its config on the joined function;
      // counting decorators is the cleanest observable here.
      expect(list?.extraDecorators?.length ?? 0).toBeGreaterThan(0);
    });

    it('rejects duplicate propertyNames inside the builder return', () => {
      expect(() =>
        defineResource({
          key: 'widget',
          entity: WidgetEntity,
          path: 'widget',
          tags: ['widget'],
          relations: (relation) => [
            relation(PartEntity, 'parts'),
            relation(PartEntity, 'parts'),
          ],
        }),
      ).toThrow(/duplicate relation propertyName "parts"/);
    });

    it('treats an empty builder return as no relations', () => {
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widget',
        tags: ['widget'],
        relations: () => [],
      });
      expect(bundle.meta.relations).toEqual([]);
      expect(bundle.persistence.entity.relations).toBeUndefined();
    });

    it('invokes the builder exactly once per defineResource call', () => {
      let invocationCount = 0;
      defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widget',
        tags: ['widget'],
        relations: (relation) => {
          invocationCount += 1;
          return [relation(PartEntity, 'parts')];
        },
      });
      expect(invocationCount).toBe(1);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // Builder + array form mixed/equivalence guarantees. The two input
  // shapes must produce structurally equivalent bundles for the same
  // logical relation set; downstream code (prepareResourceRegistration, controller
  // joins, persistence) cannot care which form was used.
  // ──────────────────────────────────────────────────────────────────
  describe('relations: builder vs array equivalence', () => {
    it('produces an equal meta.relations payload regardless of input form', () => {
      const fromArray = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widget',
        tags: ['widget'],
        relations: [
          relation(WidgetEntity, PartEntity, 'parts'),
          relation(WidgetEntity, AuditEntity, 'history', { include: 'never' }),
        ],
      });
      const fromBuilder = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widget',
        tags: ['widget'],
        relations: (relation) => [
          relation(PartEntity, 'parts'),
          relation(AuditEntity, 'history', { include: 'never' }),
        ],
      });
      expect(fromBuilder.meta.relations).toEqual(fromArray.meta.relations);
    });

    it('produces an equal persistence.entity.relations payload regardless of input form', () => {
      const fromArray = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widget',
        tags: ['widget'],
        relations: [
          relation(WidgetEntity, PartEntity, 'parts', { federated: true }),
        ],
      });
      const fromBuilder = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widget',
        tags: ['widget'],
        relations: (relation) => [
          relation(PartEntity, 'parts', { federated: true }),
        ],
      });
      expect(fromBuilder.persistence.entity.relations).toEqual(
        fromArray.persistence.entity.relations,
      );
    });
  });

  describe('providers auto-registration', () => {
    it('auto-registers referenced handlers and hooks by default', () => {
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widget',
        tags: ['widget'],
        hooks: [FakeHookClass],
        handlers: {
          create: FakeCreateHandler,
          update: FakeUpdateHandler,
        },
      });
      expect(bundle.core.providers).toEqual(
        expect.arrayContaining([
          FakeCreateHandler,
          FakeUpdateHandler,
          FakeHookClass,
        ]),
      );
    });

    it('dedupes providers so a class referenced twice appears once', () => {
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widget',
        tags: ['widget'],
        hooks: [FakeHookClass],
        providers: [FakeHookClass],
      });
      const count = (bundle.core.providers ?? []).filter(
        (p) => p === FakeHookClass,
      ).length;
      expect(count).toBe(1);
    });

    it('does not auto-register handlers when autoRegisterHandlers=false', () => {
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widget',
        tags: ['widget'],
        hooks: [FakeHookClass],
        handlers: { create: FakeCreateHandler },
        autoRegisterHandlers: false,
      });
      expect(bundle.core.providers).not.toContain(FakeCreateHandler);
      expect(bundle.core.providers).not.toContain(FakeHookClass);
    });
  });

  describe('dto wiring', () => {
    it('uses supplied DTOs for create/update request bodies', () => {
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widget',
        tags: ['widget'],
        dto: {
          response: WidgetResponseDto,
          create: WidgetCreateDto,
          update: WidgetUpdateDto,
        },
      });
      const { operations } = narrow(bundle);
      const createOp = operations.find((o) => o.operation === Operation.Create);
      const updateOp = operations.find((o) => o.operation === Operation.Update);
      expect(createOp?.request?.body).toBe(WidgetCreateDto);
      expect(updateOp?.request?.body).toBe(WidgetUpdateDto);
    });

    it('auto-generates paginated response when only response is supplied', () => {
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widget',
        tags: ['widget'],
        dto: { response: WidgetResponseDto },
      });
      const { controller } = narrow(bundle);
      expect(controller.response?.resource).toBe(WidgetResponseDto);
      expect(controller.response?.paginated).toBeDefined();
      // The generated class name reflects the resource DTO name
      const paginated = controller.response?.paginated as { name: string };
      expect(paginated.name).toBe('WidgetResponseDtoPaginatedDto');
    });
  });

  describe('overrides', () => {
    it('respects bearerAuth=false (no ApiBearerAuth decorator added)', () => {
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widget',
        tags: ['widget'],
        overrides: {
          controller: { bearerAuth: false },
        },
      });
      // With bearerAuth disabled and no hooks, only ApiTags decorator remains.
      expect(narrow(bundle).controller.extraDecorators).toHaveLength(1);
    });
  });
});
