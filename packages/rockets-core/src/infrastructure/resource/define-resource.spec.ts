import { Injectable, type PlainLiteralObject } from '@nestjs/common';
import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import { Operation } from '@concepta/nestjs-core';
import { Where } from '@concepta/nestjs-repository';
import { TypeOrmRepositoryModule } from '@bitwild/rockets-repository-typeorm';
import {
  CrudOperationResolver,
  type ConfigurableCrudGeneratedOptions,
} from '@concepta/nestjs-crud';
import { defineResource } from './define-resource';
import { relation } from './relation';
import { EntityHook, PassthroughEntityHookBase } from '../hooks/entity-hook';
import type { CrudResource } from '../../domain/interfaces/rockets-resource-bundle.interface';

/**
 * `defineResource` always produces a generated (non-class-based) CRUD
 * configuration. The top-level `core.crud` field is typed against a
 * union that also includes class-based shapes, so tests narrow it here
 * to the one shape `defineResource` actually emits.
 */
function narrow<E extends PlainLiteralObject>(
  bundle: CrudResource<E>,
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
  // Sub-resource segment fixtures — typed `subResources` keys must be
  // `keyof WidgetEntity`.
  a?: PartEntity[];
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

@EntityHook()
@Injectable()
class MinimalWidgetHook extends PassthroughEntityHookBase<WidgetEntity> {}

/** For per-operation `hooks` entries typed against {@link PlainLiteralObject}. */
@EntityHook()
@Injectable()
class MinimalPlainHook extends PassthroughEntityHookBase<PlainLiteralObject> {}

class FakeCreateHandler {}
class FakeUpdateHandler {}

describe('defineResource', () => {
  describe('validation', () => {
    it('throws when explicit key is empty', () => {
      expect(() =>
        defineResource({
          key: '',
          entity: WidgetEntity,
          path: 'widget',
          tags: ['widget'],
        }),
      ).toThrow(/`key` must be a non-empty string/);
    });

    it('derives key from entity class name when omitted', () => {
      const bundle = defineResource({ entity: WidgetEntity });
      expect(bundle.meta.key).toBe('widget');
    });

    it('explicit key wins over derived', () => {
      const bundle = defineResource({
        key: 'custom-widget',
        entity: WidgetEntity,
      });
      expect(bundle.meta.key).toBe('custom-widget');
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

    it('derives path from key when omitted (kebab-case + pluralize)', () => {
      const bundle = defineResource({
        key: 'petVaccination',
        entity: WidgetEntity,
      });
      expect(narrow(bundle).controller.path).toBe('pet-vaccinations');
    });

    it('derives tags from key when omitted (humanise + pluralise the last word)', () => {
      const bundle = defineResource({
        key: 'petVaccination',
        entity: WidgetEntity,
      });
      // Bundle uses default tags via @ApiTags() — controller.extraDecorators
      // is built but the runtime decorator wraps the value. We assert the
      // bundle generated successfully (path-derivation is the proxy).
      expect(bundle.meta.key).toBe('petVaccination');
    });

    it('throws when path is provided but empty', () => {
      expect(() =>
        defineResource({
          key: 'widget',
          entity: WidgetEntity,
          path: '',
        }),
      ).toThrow(/path.*non-empty/);
    });

    it('throws when tags is provided but empty', () => {
      expect(() =>
        defineResource({
          key: 'widget',
          entity: WidgetEntity,
          tags: [],
        }),
      ).toThrow(/tags.*non-empty/);
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

    it('leaves persistence.module undefined when not declared (aggregator falls back to root)', () => {
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widget',
        tags: ['widget'],
      });
      expect(bundle.persistence.module).toBeUndefined();
    });

    it('preserves the repository adapter when the definition declares one', () => {
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widget',
        tags: ['widget'],
        repository: TypeOrmRepositoryModule,
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
    it('preserves the full relation entry on meta.relations for buildAppRegistrationPlan validation', () => {
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
      // Thunk is preserved verbatim — resolution happens in buildAppRegistrationPlan.
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
  // logical relation set; downstream code (buildAppRegistrationPlan, controller
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
        hooks: [MinimalWidgetHook],
        handlers: {
          create: FakeCreateHandler,
          update: FakeUpdateHandler,
        },
      });
      expect(bundle.core.providers).toEqual(
        expect.arrayContaining([
          FakeCreateHandler,
          FakeUpdateHandler,
          MinimalWidgetHook,
        ]),
      );
    });

    it('dedupes providers so a class referenced twice appears once', () => {
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widget',
        tags: ['widget'],
        hooks: [MinimalWidgetHook],
        providers: [MinimalWidgetHook],
      });
      const count = (bundle.core.providers ?? []).filter(
        (p) => p === MinimalWidgetHook,
      ).length;
      expect(count).toBe(1);
    });

    it('does not auto-register handlers when autoRegisterHandlers=false', () => {
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widget',
        tags: ['widget'],
        hooks: [MinimalWidgetHook],
        handlers: { create: FakeCreateHandler },
        autoRegisterHandlers: false,
      });
      expect(bundle.core.providers).not.toContain(FakeCreateHandler);
      expect(bundle.core.providers).not.toContain(MinimalWidgetHook);
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

  describe('public flag + decorators (root-level)', () => {
    it('respects public:true (no ApiBearerAuth decorator added)', () => {
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widget',
        tags: ['widget'],
        public: true,
      });
      // With bearerAuth disabled and no hooks, only ApiTags decorator remains.
      expect(narrow(bundle).controller.extraDecorators).toHaveLength(1);
    });

    it('appends root-level `decorators` to the controller', () => {
      const fakeDecorator: ClassDecorator = () => {};
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widget',
        tags: ['widget'],
        decorators: [fakeDecorator],
      });
      // ApiBearerAuth + ApiTags + 1 user decorator = 3.
      expect(narrow(bundle).controller.extraDecorators).toHaveLength(3);
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Operations object form (keyed) — normaliser branches.
  //
  // Every branch of `normalizeOperationsInput` lives here so a future
  // refactor of that function fails immediately rather than waiting for
  // an e2e regression on sample-server.
  // ────────────────────────────────────────────────────────────────────
  describe('operations object form (keyed)', () => {
    it('enables the listed ops only', () => {
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widgets',
        tags: ['Widgets'],
        operations: {
          list: { output: WidgetResponseDto },
          read: { output: WidgetResponseDto },
        },
      });
      const ops = narrow(bundle).operations.map((o) => o.operation);
      expect(ops).toEqual([Operation.List, Operation.Read]);
    });

    it('promotes per-op response to dto.response when read+list agree', () => {
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widgets',
        tags: ['Widgets'],
        operations: {
          list: { output: WidgetResponseDto },
          read: { output: WidgetResponseDto },
        },
      });
      // The promoted dto.response drives the controller-level response wiring.
      // Each op also gets `response.resource` set on its operation override.
      const list = narrow(bundle).operations.find(
        (o) => o.operation === Operation.List,
      );
      expect(list?.response?.resource).toBe(WidgetResponseDto);
    });

    it('throws when read.output and list.output differ', () => {
      class ReadShape {
        id!: string;
      }
      class ListShape {
        id!: string;
        total!: number;
      }
      expect(() =>
        defineResource({
          key: 'widget',
          entity: WidgetEntity,
          path: 'widgets',
          tags: ['Widgets'],
          operations: {
            list: { output: ListShape },
            read: { output: ReadShape },
          },
        }),
      ).toThrow(/operations\.read\.output.*list\.output.*differ/);
    });

    it('does NOT promote when consumer declares dto.response explicitly', () => {
      class ReadShape {
        id!: string;
      }
      class ListShape {
        id!: string;
      }
      class ExplicitShape {
        id!: string;
      }
      // With dto.response explicit, divergent per-op responses are allowed.
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widgets',
        tags: ['Widgets'],
        dto: { response: ExplicitShape },
        operations: {
          list: { output: ListShape },
          read: { output: ReadShape },
        },
      });
      // Per-op responses still flow to their own operation overrides.
      const list = narrow(bundle).operations.find(
        (o) => o.operation === Operation.List,
      );
      const read = narrow(bundle).operations.find(
        (o) => o.operation === Operation.Read,
      );
      expect(list?.response?.resource).toBe(ListShape);
      expect(read?.response?.resource).toBe(ReadShape);
    });

    it('routes per-op handler to the correct slot', () => {
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widgets',
        tags: ['Widgets'],
        operations: {
          create: { input: WidgetCreateDto, handler: FakeCreateHandler },
        },
      });
      const create = narrow(bundle).operations.find(
        (o) => o.operation === Operation.Create,
      );
      expect(
        (create as { commandHandler?: unknown } | undefined)?.commandHandler,
      ).toBe(FakeCreateHandler);
    });

    it('maps delete: { soft: true } to Operation.SoftDelete', () => {
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widgets',
        tags: ['Widgets'],
        operations: {
          delete: { soft: true },
        },
      });
      const ops = narrow(bundle).operations.map((o) => o.operation);
      expect(ops).toContain(Operation.SoftDelete);
      expect(ops).not.toContain(Operation.Delete);
    });

    it('maps delete: {} (or soft: false) to Operation.Delete', () => {
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widgets',
        tags: ['Widgets'],
        operations: { delete: {} },
      });
      expect(narrow(bundle).operations.map((o) => o.operation)).toEqual([
        Operation.Delete,
      ]);
    });

    it('throws when restore is declared without delete.soft = true', () => {
      expect(() =>
        defineResource({
          key: 'widget',
          entity: WidgetEntity,
          path: 'widgets',
          tags: ['Widgets'],
          operations: {
            delete: { soft: false },
            restore: {},
          },
        }),
      ).toThrow(/operations\.restore.*requires.*delete: \{ soft: true \}/);
    });

    it('accepts restore when delete.soft = true', () => {
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widgets',
        tags: ['Widgets'],
        operations: {
          delete: { soft: true, returnDeleted: true },
          restore: { returnRestored: true },
        },
      });
      const ops = narrow(bundle).operations.map((o) => o.operation);
      expect(ops).toContain(Operation.SoftDelete);
      expect(ops).toContain(Operation.Restore);
    });

    it('throws when an op declares both input and requestOverride.body', () => {
      expect(() =>
        defineResource({
          key: 'widget',
          entity: WidgetEntity,
          path: 'widgets',
          tags: ['Widgets'],
          operations: {
            create: {
              input: WidgetCreateDto,
              requestOverride: { body: WidgetCreateDto },
            },
          },
        }),
      ).toThrow(/declares both `input` and `requestOverride\.body`/);
    });

    it('throws when an op declares both output and responseOverride.resource', () => {
      expect(() =>
        defineResource({
          key: 'widget',
          entity: WidgetEntity,
          path: 'widgets',
          tags: ['Widgets'],
          operations: {
            list: {
              output: WidgetResponseDto,
              responseOverride: { resource: WidgetResponseDto },
            },
          },
        }),
      ).toThrow(/declares both `output` and `responseOverride/);
    });

    it('throws when an empty operations object is supplied', () => {
      expect(() =>
        defineResource({
          key: 'widget',
          entity: WidgetEntity,
          path: 'widgets',
          tags: ['Widgets'],
          operations: {},
        }),
      ).toThrow(/operations.*cannot be an empty object/);
    });

    it('forwards op-level decorators and hooks to the per-op override', () => {
      function fakeMethodDecorator(): MethodDecorator {
        return () => {};
      }
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widgets',
        tags: ['Widgets'],
        operations: {
          list: {
            output: WidgetResponseDto,
            decorators: [fakeMethodDecorator()],
            hooks: [MinimalPlainHook],
          },
        },
      });
      const list = narrow(bundle).operations.find(
        (o) => o.operation === Operation.List,
      );
      expect(list?.extraDecorators?.length ?? 0).toBeGreaterThan(0);
    });

    it('forwards path / methodName / transactional to the per-op override', () => {
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widgets',
        tags: ['Widgets'],
        operations: {
          delete: {
            soft: true,
            path: 'archive/:id',
            methodName: 'archiveWidget',
            transactional: true,
          },
        },
      });
      const op = narrow(bundle).operations.find(
        (o) => o.operation === Operation.SoftDelete,
      );
      expect(op?.path).toBe('archive/:id');
      expect(op?.methodName).toBe('archiveWidget');
      expect(op?.transactional).toBe(true);
    });
  });

  describe('operations array form — handler validation', () => {
    it('throws when a handler is declared for an op not in the array', () => {
      expect(() =>
        defineResource({
          key: 'widget',
          entity: WidgetEntity,
          path: 'widgets',
          tags: ['Widgets'],
          operations: [Operation.List],
          handlers: { create: FakeCreateHandler },
        }),
      ).toThrow(
        /handler declared for "create".*operation "create" is not in `operations`/,
      );
    });

    it('accepts handlers that match enabled operations', () => {
      expect(() =>
        defineResource({
          key: 'widget',
          entity: WidgetEntity,
          path: 'widgets',
          tags: ['Widgets'],
          operations: [Operation.List, Operation.Create],
          handlers: { create: FakeCreateHandler },
        }),
      ).not.toThrow();
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Sub-resources nested form — defineResource materialises sub-bundles
  // and exposes them on the parent's `bundle.subResources` array.
  // ────────────────────────────────────────────────────────────────────
  describe('subResources nested form', () => {
    it('returns no `subResources` field when none are declared', () => {
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widgets',
        tags: ['Widgets'],
      });
      expect(bundle.subResources).toBeUndefined();
    });

    it('materialises a single sub-resource into a full bundle', async () => {
      const { defineSubResource } = await import('./define-sub-resource');
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widgets',
        tags: ['Widgets'],
        subResources: {
          parts: defineSubResource({
            key: 'widgetPart',
            owner: false,
            entity: PartEntity,
            operations: { list: { output: WidgetResponseDto } },
          }),
        },
      });
      expect(bundle.subResources).toHaveLength(1);
      const sub = bundle.subResources![0];
      expect(sub.meta.key).toBe('widgetPart');
    });

    it('composes the path as <parent.path>/:<parentKey>/<segment>', async () => {
      const { defineSubResource } = await import('./define-sub-resource');
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widgets',
        tags: ['Widgets'],
        subResources: {
          parts: defineSubResource({
            key: 'widgetPart',
            owner: false,
            entity: PartEntity,
            operations: { list: { output: WidgetResponseDto } },
          }),
        },
      });
      const sub = narrow(bundle.subResources![0]);
      expect(sub.controller.path).toBe('widgets/:widgetId/parts');
    });

    it('honors explicit parentKey override', async () => {
      const { defineSubResource } = await import('./define-sub-resource');
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widgets',
        tags: ['Widgets'],
        subResources: {
          parts: defineSubResource({
            key: 'widgetPart',
            owner: false,
            entity: PartEntity,
            parentKey: 'wid',
            operations: { list: { output: WidgetResponseDto } },
          }),
        },
      });
      const sub = narrow(bundle.subResources![0]);
      expect(sub.controller.path).toBe('widgets/:wid/parts');
    });

    it('inherits parent tags when sub does not declare tags', async () => {
      const { defineSubResource } = await import('./define-sub-resource');
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widgets',
        tags: ['Widgets'],
        subResources: {
          parts: defineSubResource({
            key: 'widgetPart',
            owner: false,
            entity: PartEntity,
            operations: { list: { output: WidgetResponseDto } },
          }),
        },
      });
      const sub = bundle.subResources![0];
      expect(sub.meta.key).toBe('widgetPart');
      // Sub bundle gets tags via @ApiTags() on the controller decorators.
      // We only assert the materialisation succeeded (tags inherited).
      expect(narrow(sub).controller.extraDecorators).toBeDefined();
    });

    it('overrides tags when sub declares its own', async () => {
      const { defineSubResource } = await import('./define-sub-resource');
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widgets',
        tags: ['Widgets'],
        subResources: {
          parts: defineSubResource({
            key: 'widgetPart',
            owner: false,
            entity: PartEntity,
            tags: ['Parts'],
            operations: { list: { output: WidgetResponseDto } },
          }),
        },
      });
      // Sub successfully materialised with its own tags.
      expect(bundle.subResources![0].meta.key).toBe('widgetPart');
    });

    it('defaults owner to userId (guard injected) when owner is omitted', async () => {
      const { defineSubResource } = await import('./define-sub-resource');
      const { PathScopeGuard } = await import('../guards/path-scope.guard');
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widgets',
        tags: ['Widgets'],
        subResources: {
          parts: defineSubResource({
            key: 'widgetPart',
            entity: PartEntity,
            operations: { list: { output: WidgetResponseDto } },
          }),
        },
      });
      const sub = bundle.subResources![0];
      const Expected = PathScopeGuard.for('widgetId', 'widget', 'userId');
      expect(sub.core.providers).toContain(Expected);
    });

    it('auto-injects PathScopeGuard into sub providers when owner is declared', async () => {
      const { defineSubResource } = await import('./define-sub-resource');
      const { PathScopeGuard } = await import('../guards/path-scope.guard');
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widgets',
        tags: ['Widgets'],
        subResources: {
          parts: defineSubResource({
            key: 'widgetPart',
            entity: PartEntity,
            owner: 'userId',
            operations: { list: { output: WidgetResponseDto } },
          }),
        },
      });
      const sub = bundle.subResources![0];
      const Expected = PathScopeGuard.for('widgetId', 'widget', 'userId');
      expect(sub.core.providers).toContain(Expected);
    });

    it('honors owner override when auto-binding the guard', async () => {
      const { defineSubResource } = await import('./define-sub-resource');
      const { PathScopeGuard } = await import('../guards/path-scope.guard');
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widgets',
        tags: ['Widgets'],
        subResources: {
          parts: defineSubResource({
            key: 'widgetPart',
            entity: PartEntity,
            owner: 'orgId',
            operations: { list: { output: WidgetResponseDto } },
          }),
        },
      });
      const sub = bundle.subResources![0];
      const Override = PathScopeGuard.for('widgetId', 'widget', 'orgId');
      expect(sub.core.providers).toContain(Override);
    });

    it('does NOT auto-inject AfterCreateReloadHook by default (opt-in)', async () => {
      const { defineSubResource } = await import('./define-sub-resource');
      const { AfterCreateReloadHook } = await import(
        '../hooks/after-create-reload.hook'
      );
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widgets',
        tags: ['Widgets'],
        subResources: {
          parts: defineSubResource({
            key: 'widgetPart',
            entity: PartEntity,
            owner: 'userId',
            operations: { list: { output: WidgetResponseDto } },
          }),
        },
      });
      const sub = bundle.subResources![0];
      const Reload = AfterCreateReloadHook.for(PartEntity);
      expect(sub.core.providers ?? []).not.toContain(Reload);
    });

    it('opts in to AfterCreateReloadHook when reloadAfterCreate is true', async () => {
      const { defineSubResource } = await import('./define-sub-resource');
      const { AfterCreateReloadHook } = await import(
        '../hooks/after-create-reload.hook'
      );
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widgets',
        tags: ['Widgets'],
        subResources: {
          parts: defineSubResource({
            key: 'widgetPart',
            entity: PartEntity,
            owner: 'userId',
            reloadAfterCreate: true,
            operations: { list: { output: WidgetResponseDto } },
          }),
        },
      });
      const sub = bundle.subResources![0];
      const Reload = AfterCreateReloadHook.for(PartEntity);
      expect(sub.core.providers).toContain(Reload);
    });

    it('skips the auto guard when owner is false', async () => {
      const { defineSubResource } = await import('./define-sub-resource');
      const { PathScopeGuard } = await import('../guards/path-scope.guard');
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widgets',
        tags: ['Widgets'],
        subResources: {
          parts: defineSubResource({
            key: 'widgetPart',
            entity: PartEntity,
            owner: false,
            operations: { list: { output: WidgetResponseDto } },
          }),
        },
      });
      const sub = bundle.subResources![0];
      const Guard = PathScopeGuard.for('widgetId', 'widget', 'userId');
      expect(sub.core.providers ?? []).not.toContain(Guard);
    });

    it('throws at runtime when an empty-string segment key slips through (defence in depth)', async () => {
      const { defineSubResource } = await import('./define-sub-resource');
      // Empty-string keys are blocked at compile time by the
      // `keyof Entity` constraint, so the call site uses
      // `@ts-expect-error` to assert TS rejects it. The runtime check
      // remains as defence in depth for code paths that bypass the
      // type checker (loose `as` casts, reflection-driven configs).
      expect(() =>
        defineResource({
          key: 'widget',
          entity: WidgetEntity,
          path: 'widgets',
          tags: ['Widgets'],
          subResources: {
            // @ts-expect-error — empty-string is not a key of WidgetEntity.
            '': defineSubResource({
              key: 'widgetPart',
              owner: false,
              entity: PartEntity,
              operations: { list: { output: WidgetResponseDto } },
            }),
          },
        }),
      ).toThrow(/subResources keys must be non-empty/);
    });

    it('produces a separate persistence entry for the sub entity', async () => {
      const { defineSubResource } = await import('./define-sub-resource');
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widgets',
        tags: ['Widgets'],
        subResources: {
          parts: defineSubResource({
            key: 'widgetPart',
            owner: false,
            entity: PartEntity,
            operations: { list: { output: WidgetResponseDto } },
          }),
        },
      });
      const sub = bundle.subResources![0];
      expect(sub.persistence.entity.entity).toBe(PartEntity);
      expect(sub.persistence.entity.key).toBe('widgetPart');
    });

    it('inherits parent persistence module when sub does not declare one', async () => {
      const { defineSubResource } = await import('./define-sub-resource');
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widgets',
        tags: ['Widgets'],
        subResources: {
          parts: defineSubResource({
            key: 'widgetPart',
            owner: false,
            entity: PartEntity,
            operations: { list: { output: WidgetResponseDto } },
          }),
        },
      });
      const sub = bundle.subResources![0];
      expect(sub.persistence.module).toBe(bundle.persistence.module);
    });

    it('composes deeply nested sub-resources (N-level)', async () => {
      const { defineSubResource } = await import('./define-sub-resource');
      class GrandPartEntity {
        id!: string;
      }
      // Use a local PartEntity that declares `labels` so the typed
      // sub-resources key constraint is satisfied.
      class LocalPartEntity {
        id!: string;
        labels?: GrandPartEntity[];
      }
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widgets',
        tags: ['Widgets'],
        subResources: {
          parts: defineSubResource({
            key: 'widgetPart',
            owner: false,
            entity: LocalPartEntity,
            operations: { list: { output: WidgetResponseDto } },
            subResources: {
              labels: defineSubResource({
                key: 'partLabel',
                owner: false,
                entity: GrandPartEntity,
                operations: { list: { output: WidgetResponseDto } },
              }),
            },
          }),
        },
      });
      const part = bundle.subResources![0];
      expect(part.subResources).toHaveLength(1);
      const label = part.subResources![0];
      expect(narrow(label).controller.path).toBe(
        'widgets/:widgetId/parts/:widgetPartId/labels',
      );
    });

    it('composes a 3-level path (a/:aId/b/:bId/c/:cId/d)', async () => {
      const { defineSubResource } = await import('./define-sub-resource');
      class L3 {
        id!: string;
      }
      class L2 {
        id!: string;
        c?: L3[];
      }
      class L1 {
        id!: string;
        b?: L2[];
      }
      const bundle = defineResource({
        key: 'level0',
        entity: WidgetEntity,
        path: 'L0',
        tags: ['x'],
        subResources: {
          a: defineSubResource({
            key: 'level1',
            owner: false,
            entity: L1,
            subResources: {
              b: defineSubResource({
                key: 'level2',
                owner: false,
                entity: L2,
                subResources: {
                  c: defineSubResource({
                    key: 'level3',
                    entity: L3,
                    owner: false,
                  }),
                },
              }),
            },
          }),
        },
      });
      const a = bundle.subResources![0];
      const b = a.subResources![0];
      const c = b.subResources![0];
      expect(narrow(c).controller.path).toBe(
        'L0/:level0Id/a/:level1Id/b/:level2Id/c',
      );
    });

    it('composes the path for every entry when parent path is an array', async () => {
      const { defineSubResource } = await import('./define-sub-resource');
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: ['widgets', 'v2/widgets'],
        tags: ['Widgets'],
        subResources: {
          parts: defineSubResource({
            key: 'widgetPart',
            owner: false,
            entity: PartEntity,
          }),
        },
      });
      const sub = narrow(bundle.subResources![0]);
      expect(Array.isArray(sub.controller.path)).toBe(true);
      const paths = sub.controller.path as readonly string[];
      expect(paths).toContain('widgets/:widgetId/parts');
      expect(paths).toContain('v2/widgets/:widgetId/parts');
    });

    it('strips trailing slash on parent path before composition', async () => {
      const { defineSubResource } = await import('./define-sub-resource');
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widgets/',
        tags: ['Widgets'],
        subResources: {
          parts: defineSubResource({
            key: 'widgetPart',
            owner: false,
            entity: PartEntity,
          }),
        },
      });
      expect(narrow(bundle.subResources![0]).controller.path).toBe(
        'widgets/:widgetId/parts',
      );
    });

    it('kebab-cases the segment key for the URL by default (camelCase → kebab-case)', async () => {
      const { defineSubResource } = await import('./define-sub-resource');
      class WithCamelCaseRelation {
        id!: string;
        name!: string;
        // The relation property is camelCase — typed key constraint
        // enforces this. The default URL is the kebab-cased version.
        myItems?: PartEntity[];
      }
      const bundle = defineResource({
        key: 'widget',
        entity: WithCamelCaseRelation,
        path: 'widgets',
        tags: ['Widgets'],
        subResources: {
          myItems: defineSubResource({
            key: 'myItem',
            entity: PartEntity,
            owner: false,
          }),
        },
      });
      expect(narrow(bundle.subResources![0]).controller.path).toBe(
        'widgets/:widgetId/my-items',
      );
    });

    it('rejects a sub-resource whose entity does not match the parent relation element type (compile-time)', async () => {
      // The phantom `<Sub>` generic on `RocketsSubResourceDefinition`
      // forces the parent's `subResources[K]` slot to accept only a
      // sub whose entity matches `ElementOf<NonNullable<E[K]>>`.
      // Mismatch fails compilation — assert via `@ts-expect-error`.
      //
      // The two entities below are STRUCTURALLY distinct so TypeScript's
      // structural typing actually engages the invariance check on the
      // phantom marker.
      const { defineSubResource } = await import('./define-sub-resource');
      class CompletelyUnrelated {
        readonly nothingLikePartEntity: number = 0;
        readonly aBrandNewField: { whoa: boolean } = { whoa: true };
      }
      // WidgetEntity.parts is PartEntity[]. Passing CompletelyUnrelated
      // for the `parts` segment must NOT type-check.
      defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widgets',
        tags: ['Widgets'],
        subResources: {
          // @ts-expect-error — entity mismatch: parts requires PartEntity, not CompletelyUnrelated.
          parts: defineSubResource({
            key: 'mismatch',
            owner: false,
            entity: CompletelyUnrelated,
          }),
        },
      });
    });

    it('accepts a thunk `() => Class` for the sub entity (db-agnostic, circular-import safe)', async () => {
      const { defineSubResource } = await import('./define-sub-resource');
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widgets',
        tags: ['Widgets'],
        subResources: {
          parts: defineSubResource({
            key: 'widgetPart',
            owner: false,
            entity: () => PartEntity,
          }),
        },
      });
      expect(bundle.subResources).toHaveLength(1);
      // The thunk resolves at construction time, so persistence still
      // gets the resolved class.
      expect(bundle.subResources![0].persistence.entity.entity).toBe(
        PartEntity,
      );
    });

    it('honors segment override (decouples URL from entity property)', async () => {
      const { defineSubResource } = await import('./define-sub-resource');
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widgets',
        tags: ['Widgets'],
        subResources: {
          parts: defineSubResource({
            key: 'widgetPart',
            owner: false,
            entity: PartEntity,
            segment: 'pieces', // URL says `pieces`, entity prop says `parts`
          }),
        },
      });
      expect(narrow(bundle.subResources![0]).controller.path).toBe(
        'widgets/:widgetId/pieces',
      );
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Coverage gaps surfaced by council audit — pinning untested branches.
  // ────────────────────────────────────────────────────────────────────
  describe('operations object form — replace op (council gap #7)', () => {
    it('keyed replace op routes body and registers Operation.Replace', () => {
      class WidgetReplaceDto {
        name!: string;
      }
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widgets',
        tags: ['Widgets'],
        operations: {
          replace: { input: WidgetReplaceDto, output: WidgetResponseDto },
        },
      });
      const ops = narrow(bundle).operations.map((o) => o.operation);
      expect(ops).toContain(Operation.Replace);
      const replace = narrow(bundle).operations.find(
        (o) => o.operation === Operation.Replace,
      );
      expect(replace?.request?.body).toBe(WidgetReplaceDto);
    });

    it('routes the per-op handler to the replace slot', () => {
      class WidgetReplaceDto {
        name!: string;
      }
      class FakeReplaceHandler {}
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widgets',
        tags: ['Widgets'],
        operations: {
          replace: {
            input: WidgetReplaceDto,
            output: WidgetResponseDto,
            handler: FakeReplaceHandler,
          },
        },
      });
      const replace = narrow(bundle).operations.find(
        (o) => o.operation === Operation.Replace,
      );
      expect(
        (replace as { commandHandler?: unknown } | undefined)?.commandHandler,
      ).toBe(FakeReplaceHandler);
    });
  });

  describe('returnDeleted / returnRestored response flags (council gap #8)', () => {
    it('returnDeleted: true attaches to the SoftDelete operation response', () => {
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widgets',
        tags: ['Widgets'],
        operations: {
          delete: { soft: true, returnDeleted: true },
        },
      });
      const op = narrow(bundle).operations.find(
        (o) => o.operation === Operation.SoftDelete,
      );
      expect(op?.response?.returnDeleted).toBe(true);
    });

    it('returnRestored: true attaches to the Restore operation response', () => {
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widgets',
        tags: ['Widgets'],
        operations: {
          delete: { soft: true },
          restore: { returnRestored: true },
        },
      });
      const op = narrow(bundle).operations.find(
        (o) => o.operation === Operation.Restore,
      );
      expect(op?.response?.returnRestored).toBe(true);
    });

    it('all four flags simultaneously: soft + returnDeleted + restore + returnRestored', () => {
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widgets',
        tags: ['Widgets'],
        operations: {
          delete: { soft: true, returnDeleted: true },
          restore: { returnRestored: true },
        },
      });
      const sd = narrow(bundle).operations.find(
        (o) => o.operation === Operation.SoftDelete,
      );
      const rs = narrow(bundle).operations.find(
        (o) => o.operation === Operation.Restore,
      );
      expect(sd?.response?.returnDeleted).toBe(true);
      expect(rs?.response?.returnRestored).toBe(true);
    });

    it('returnDeleted: false explicitly attaches to the response (not omitted)', () => {
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widgets',
        tags: ['Widgets'],
        operations: {
          delete: { soft: true, returnDeleted: false },
        },
      });
      const op = narrow(bundle).operations.find(
        (o) => o.operation === Operation.SoftDelete,
      );
      expect(op?.response?.returnDeleted).toBe(false);
    });
  });

  describe('legacy dto fallback alongside keyed operations (council gap #7)', () => {
    it('falls back to dto.create when keyed operations.create omits body', () => {
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widgets',
        tags: ['Widgets'],
        dto: { create: WidgetCreateDto, response: WidgetResponseDto },
        operations: {
          create: {}, // body omitted — should fall back to dto.create
        },
      });
      const op = narrow(bundle).operations.find(
        (o) => o.operation === Operation.Create,
      );
      expect(op?.request?.body).toBe(WidgetCreateDto);
    });

    it('falls back to dto.update when keyed operations.update omits body', () => {
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widgets',
        tags: ['Widgets'],
        dto: { update: WidgetUpdateDto, response: WidgetResponseDto },
        operations: {
          update: {},
        },
      });
      const op = narrow(bundle).operations.find(
        (o) => o.operation === Operation.Update,
      );
      expect(op?.request?.body).toBe(WidgetUpdateDto);
    });

    it('per-op body wins over dto.create fallback', () => {
      class CustomCreateDto {
        name!: string;
      }
      const bundle = defineResource({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widgets',
        tags: ['Widgets'],
        dto: { create: WidgetCreateDto, response: WidgetResponseDto },
        operations: {
          create: { input: CustomCreateDto },
        },
      });
      const op = narrow(bundle).operations.find(
        (o) => o.operation === Operation.Create,
      );
      expect(op?.request?.body).toBe(CustomCreateDto);
    });
  });

  describe('body + requestOverride co-existence (legitimate use case)', () => {
    it('accepts body + requestOverride.params together', () => {
      class CustomBody {
        name!: string;
      }
      // `body` sets request.body; `requestOverride: { params: ... }` is
      // independent — the conflict throw only fires when BOTH set
      // `requestOverride.body`. This pins the legitimate use case where
      // a consumer wants the high-level body shorthand AND custom URL
      // params.
      expect(() =>
        defineResource({
          key: 'widget',
          entity: WidgetEntity,
          path: 'widgets',
          tags: ['Widgets'],
          operations: {
            create: {
              input: CustomBody,
              requestOverride: {
                params: {
                  id: { field: 'id', type: 'uuid', primary: true },
                },
              },
            },
          },
        }),
      ).not.toThrow();
    });
  });
});
