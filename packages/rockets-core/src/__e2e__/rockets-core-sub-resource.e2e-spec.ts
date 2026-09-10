/**
 * E2E coverage for `defineSubResource` and `AfterCreateReloadHook`:
 *
 *  1. Top-level resource WITH eager relation + manual reload hook →
 *     create response carries the loaded relation.
 *  2. Top-level resource WITHOUT eager relations (no reload hook) →
 *     create / list / read still work; nothing breaks.
 *  3. Sub-resource WITH eager relation + `reloadAfterCreate: true` →
 *     create response carries the loaded relation (proves the opt-in).
 *  4. Sub-resource WITHOUT `reloadAfterCreate` (default off) →
 *     create response does NOT carry the eager relation.
 *  5. Hard delete + soft delete on both top-level and sub-resource.
 *  6. List / read on both, with and without relation joins.
 *  7. A parent hidden by one of the PARENT's own read hooks hides its
 *     whole sub-resource (regression for #45 — the guard's parent lookup
 *     used to run with hooks disabled).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  Global,
  INestApplication,
  Injectable,
  Module,
  UnauthorizedException,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Column,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TypeOrmRepositoryModule } from '@concepta/rockets-repository-typeorm';
import {
  getDynamicRepositoryToken,
  RepositoryInterface,
  Where,
  type RepositoryFindOneOptions,
  type RepositoryFindOptions,
} from '@concepta/nestjs-repository';
import { withOpenApi } from '@concepta/nestjs-core';
import request from 'supertest';
import { z } from 'zod';
import type {
  AuthAdapterInterface,
  AuthAttemptResult,
  AuthRequest,
} from '../domain/interfaces/auth-adapter.interface';
import { extractBearerToken } from '../infrastructure/auth/extract-bearer-token';
import { RocketsCoreModule } from '../rockets-core.module';
import { SwaggerUiService } from '../common/swagger-ui/swagger-ui.service';
import { USER_METADATA_MODULE_ENTITY_KEY } from '../rockets-core.constants';
import { AuthServerGuard } from '../infrastructure/guards/auth-server.guard';
import { defineResource } from '../infrastructure/resource/define-resource';
import { defineSubResource } from '../infrastructure/resource/define-sub-resource';
import { AfterCreateReloadHook } from '../infrastructure/hooks/after-create-reload.hook';
import { OwnerStampHook } from '../infrastructure/hooks/owner-stamp.hook';
import {
  EntityHook,
  type EntityHookContext,
  PassthroughEntityHookBase,
} from '../infrastructure/hooks/entity-hook';
import { getActor, getCrudContext } from '../utils/get-actor.helper';
import { defineAuthAdapter } from '../infrastructure/auth/define-auth-adapter';

// ── Auth fixture ──

@Injectable()
class StubAuthAdapter implements AuthAdapterInterface {
  async authenticate(request: AuthRequest): Promise<AuthAttemptResult> {
    const token = extractBearerToken(request);
    if (token === null) return { matched: false };
    if (token === 'u1') return { matched: true, user: { id: 'u1', sub: 'u1' } };
    if (token === 'u2') return { matched: true, user: { id: 'u2', sub: 'u2' } };
    return { matched: true, error: new UnauthorizedException() };
  }
}

// ── Entities ──

@Entity('categories')
class CategoryEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar' }) label!: string;
}

@Entity('parents')
class ParentEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar' }) name!: string;
  @Column({ type: 'varchar' }) userId!: string;
  @Column({ type: 'uuid', nullable: true }) categoryId?: string;
  @Column({ type: 'boolean', default: false }) retired!: boolean;
  @ManyToOne(() => CategoryEntity, { eager: true, nullable: true })
  @JoinColumn({ name: 'categoryId' })
  category?: CategoryEntity;
  @DeleteDateColumn() dateDeleted?: Date;
  // Phantom relation properties — typed only; defineSubResource keys
  // must satisfy `keyof Parent`. The actual joins live on the child.
  children?: ChildEntity[];
  childrenNoReload?: ChildNoReloadEntity[];
  stamps?: StampEntity[];
  unscopedNotes?: UnscopedNoteEntity[];
  looseMiddles?: LooseMiddleEntity[];
}

// Every column is server-stamped (pk, FK from the path, owner from the
// actor): the create body is legitimately `{}`.
@Entity('stamps')
class StampEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) parentId!: string;
  @Column({ type: 'varchar' }) userId!: string;
  @Column({ type: 'varchar', nullable: true }) note?: string | null;
}

@Entity('unscoped_notes')
class UnscopedNoteEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) parentId!: string;
  @Column({ type: 'varchar' }) label!: string;
}

// Depth-3 probe under `scope: false`: ancestor params are `disabled`, so
// they never reach `buildWhere`, and `scope: false` drops the guard that
// verified the chain. Does a child of ANOTHER parent stay reachable?
@Entity('unscoped_deep_notes')
class UnscopedDeepNoteEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) childId!: string;
  @Column({ type: 'varchar' }) label!: string;
}

// The variant the depth-3 fixture cannot see: the UNSCOPED level is the
// MIDDLE one, so it composes no `PathScopeHook` for the deep guard to
// replay. Probed below.
@Entity('loose_middles')
class LooseMiddleEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) parentId!: string;
  @Column({ type: 'varchar' }) title!: string;
  // Phantom relation property — sub-resource keys must satisfy `keyof E`.
  looseLeaves?: LooseLeafEntity[];
}

@Entity('loose_leaves')
class LooseLeafEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) looseMiddleId!: string;
  @Column({ type: 'varchar' }) label!: string;
}

@Entity('children')
class ChildEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar' }) title!: string;
  @Column({ type: 'uuid' }) parentId!: string;
  @Column({ type: 'uuid' }) categoryId!: string;
  // Owner column for the GRANDCHILD's PathScopeGuard — a three-level
  // nest scopes its parent lookup against the middle entity.
  @Column({ type: 'varchar' }) userId!: string;
  @ManyToOne(() => CategoryEntity, { eager: true })
  @JoinColumn({ name: 'categoryId' })
  category?: CategoryEntity;
  @DeleteDateColumn() dateDeleted?: Date;
  notes?: GrandchildEntity[];
  unscopedDeepNotes?: UnscopedDeepNoteEntity[];
}

@Entity('grandchildren')
class GrandchildEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar' }) label!: string;
  @Column({ type: 'uuid' }) childId!: string;
}

@Entity('children_no_reload')
class ChildNoReloadEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar' }) title!: string;
  @Column({ type: 'uuid' }) parentId!: string;
  @Column({ type: 'uuid' }) categoryId!: string;
  @ManyToOne(() => CategoryEntity, { eager: true })
  @JoinColumn({ name: 'categoryId' })
  category?: CategoryEntity;
}

@Entity('plain_items')
class PlainItemEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar' }) name!: string;
  @Column({ type: 'varchar' }) userId!: string;
  @DeleteDateColumn() dateDeleted?: Date;
}

// ── Schemas ──

const categoryResponseSchema = withOpenApi(
  z.object({ id: z.uuid(), label: z.string() }),
  'CategoryResponseDto',
);

const categoryCreateSchema = withOpenApi(
  z.object({ label: z.string() }),
  'CategoryCreateDto',
);

const parentCreateSchema = withOpenApi(
  z.object({ name: z.string(), categoryId: z.uuid().optional() }),
  'ParentCreateDto',
);

const parentResponseSchema = withOpenApi(
  z.object({
    id: z.uuid(),
    name: z.string(),
    categoryId: z.uuid().nullable().optional(),
    category: categoryResponseSchema.nullable().optional(),
    dateDeleted: z.date().nullable().optional(),
  }),
  'ParentResponseDto',
);

const childCreateSchema = withOpenApi(
  z.object({ title: z.string(), categoryId: z.uuid() }),
  'ChildCreateDto',
);

const grandchildCreateSchema = withOpenApi(
  z.object({ label: z.string() }),
  'GrandchildCreateDto',
);

const grandchildResponseSchema = withOpenApi(
  z.object({ id: z.uuid(), label: z.string(), childId: z.uuid() }),
  'GrandchildResponseDto',
);

const stampCreateSchema = withOpenApi(
  z.object({ note: z.string().optional() }),
  'StampCreateDto',
);

const stampResponseSchema = withOpenApi(
  z.object({
    id: z.uuid(),
    parentId: z.uuid(),
    userId: z.string(),
    note: z.string().nullable().optional(),
  }),
  'StampResponseDto',
);

const unscopedNoteCreateSchema = withOpenApi(
  z.object({ label: z.string(), parentId: z.uuid().optional() }),
  'UnscopedNoteCreateDto',
);

const unscopedNoteResponseSchema = withOpenApi(
  z.object({ id: z.uuid(), parentId: z.uuid(), label: z.string() }),
  'UnscopedNoteResponseDto',
);

const unscopedDeepNoteCreateSchema = withOpenApi(
  z.object({ label: z.string() }),
  'UnscopedDeepNoteCreateDto',
);

const unscopedDeepNoteResponseSchema = withOpenApi(
  z.object({ id: z.uuid(), childId: z.uuid(), label: z.string() }),
  'UnscopedDeepNoteResponseDto',
);

const looseMiddleCreateSchema = withOpenApi(
  z.object({ title: z.string() }),
  'LooseMiddleCreateDto',
);
const looseMiddleResponseSchema = withOpenApi(
  z.object({ id: z.uuid(), parentId: z.uuid(), title: z.string() }),
  'LooseMiddleResponseDto',
);
const looseLeafCreateSchema = withOpenApi(
  z.object({ label: z.string() }),
  'LooseLeafCreateDto',
);
const looseLeafResponseSchema = withOpenApi(
  z.object({ id: z.uuid(), looseMiddleId: z.uuid(), label: z.string() }),
  'LooseLeafResponseDto',
);

const childResponseSchema = withOpenApi(
  z.object({
    id: z.uuid(),
    title: z.string(),
    parentId: z.uuid(),
    categoryId: z.uuid(),
    category: categoryResponseSchema.nullable().optional(),
    dateDeleted: z.date().nullable().optional(),
  }),
  'ChildResponseDto',
);

const plainItemCreateSchema = withOpenApi(
  z.object({ name: z.string() }),
  'PlainItemCreateDto',
);

const plainItemResponseSchema = withOpenApi(
  z.object({
    id: z.uuid(),
    name: z.string(),
    dateDeleted: z.date().nullable().optional(),
  }),
  'PlainItemResponseDto',
);

// ── User-metadata stub ──

class StubMetadataRepo {
  async findOne() {
    return null;
  }
  async create(data: Record<string, unknown>) {
    return { id: '1', ...data };
  }
  async update(e: Record<string, unknown>, d: Record<string, unknown>) {
    return { ...e, ...d };
  }
}

const metaToken = getDynamicRepositoryToken(USER_METADATA_MODULE_ENTITY_KEY);

@Global()
@Module({
  providers: [{ provide: metaToken, useValue: new StubMetadataRepo() }],
  exports: [metaToken],
})
class MetaModule {}

// ── Parent retention hook ──

/**
 * Models the field case from #45: retention expressed as non-existence.
 * A retired parent is invisible to every read of the parent resource —
 * and therefore must be invisible to its sub-resources too.
 *
 * Deliberately gated on `getCrudContext(ctx)`, the shape this repo's own
 * JSDoc teaches ("HTTP path only; an internal repository call is the
 * caller's responsibility"). A replay context without `params` /
 * `operation` makes that guard return `undefined` and the hook fail
 * OPEN — so this fixture is what proves the guard hands over a real
 * CRUD context, not just a hook list.
 */
@EntityHook({ entity: ParentEntity })
@Injectable()
class ParentRetentionHook extends PassthroughEntityHookBase<ParentEntity> {
  override beforeFindOne(
    options: RepositoryFindOneOptions<ParentEntity>,
    ctx?: EntityHookContext,
  ): RepositoryFindOneOptions<ParentEntity> {
    return this.live(options, ctx);
  }

  override beforeFindAndCount(
    options: RepositoryFindOptions<ParentEntity>,
    ctx?: EntityHookContext,
  ): RepositoryFindOptions<ParentEntity> {
    return this.live(options, ctx);
  }

  private live<
    T extends
      | RepositoryFindOptions<ParentEntity>
      | RepositoryFindOneOptions<ParentEntity>,
  >(options: T, ctx: EntityHookContext | undefined): T {
    const crudCtx = getCrudContext(ctx);
    if (!crudCtx) return options;
    const clause = Where.eq<ParentEntity>('retired', false);
    return {
      ...options,
      where: options.where ? Where.and(options.where, clause) : clause,
    };
  }
}

/**
 * Second half of #45: a parent hook gated on the ACTOR, not on the CRUD
 * context.
 *
 * The guard runs BEFORE `ActorOverlay` (an `APP_INTERCEPTOR`), so the
 * request's own actor overlay does not exist yet when the parent lookup
 * happens. The guard therefore defines `ActorCtx` on its detached host —
 * and `host.with(CrudCtx)` must keep that reachable through the
 * prototype chain, or every owner-scoped parent hook silently loses the
 * actor exactly where the fix claimed to restore it.
 *
 * Fails CLOSED on a missing actor (impossible clause) rather than
 * passing through: an actor-scoped read that cannot identify the actor
 * must return nothing, never everything. That is what makes this test
 * decisive — drop `defineOverlay(ActorCtx, ...)` from the guard and the
 * sub-resource routes 404.
 */
@EntityHook({ entity: ParentEntity })
@Injectable()
class ParentActorScopeHook extends PassthroughEntityHookBase<ParentEntity> {
  override beforeFindOne(
    options: RepositoryFindOneOptions<ParentEntity>,
    ctx?: EntityHookContext,
  ): RepositoryFindOneOptions<ParentEntity> {
    const actor = getActor(ctx);
    const clause = actor?.id
      ? Where.eq<ParentEntity>('userId', actor.id)
      : Where.eq<ParentEntity>('id', '__no_actor__');
    return {
      ...options,
      where: options.where ? Where.and(options.where, clause) : clause,
    };
  }
}

// ── Resources ──

const ParentOwnerStamp = OwnerStampHook.for(ParentEntity);
const PlainItemOwnerStamp = OwnerStampHook.for(PlainItemEntity);

const parentResource = defineResource<ParentEntity>({
  key: 'parent',
  entity: ParentEntity,
  path: 'parents',
  tags: ['Parents'],
  // Manual AfterCreateReloadHook on a top-level resource with eager
  // relation — the hook is auto-only for sub-resources; top-level
  // resources opt in by adding it themselves.
  hooks: [
    ParentOwnerStamp,
    ParentRetentionHook,
    ParentActorScopeHook,
    AfterCreateReloadHook.for(ParentEntity),
  ],
  relations: (rel) => [rel(CategoryEntity, 'category')],
  operations: {
    list: { output: parentResponseSchema },
    read: { output: parentResponseSchema },
    // `transactional` is what exposes the reload hook's `ctx`: the row is
    // inserted inside the transaction, so a reload that does not join it
    // cannot see the row and the eager relation goes missing.
    create: {
      input: parentCreateSchema,
      output: parentResponseSchema,
      transactional: true,
    },
    delete: { soft: true, returnDeleted: true },
  },
  subResources: {
    children: defineSubResource<ChildEntity>({
      key: 'child',
      entity: ChildEntity,
      tags: ['Children'],
      // `owner` defaults to 'userId' (declared here explicitly).
      // PathScopeHook + PathScopeGuard are auto-injected.
      // `reloadAfterCreate` opts the child into the eager-relation reload.
      owner: 'userId',
      reloadAfterCreate: true,
      hooks: [OwnerStampHook.for(ChildEntity)],
      relations: (rel) => [rel(CategoryEntity, 'category')],
      operations: {
        list: { output: childResponseSchema },
        read: { output: childResponseSchema },
        create: { input: childCreateSchema, output: childResponseSchema },
        delete: { soft: true, returnDeleted: true },
      },
      // Third level. Its guard looks the CHILD up, replaying the child's
      // own hooks — which include the `PathScopeHook` binding the child
      // to `:parentId`. Without a CRUD context in that replay the FK
      // clause disappears and a child of a DIFFERENT parent (same owner)
      // becomes reachable through this path.
      subResources: {
        unscopedDeepNotes: defineSubResource<UnscopedDeepNoteEntity>({
          key: 'unscopedDeepNote',
          entity: UnscopedDeepNoteEntity,
          parentKey: 'childId',
          segment: 'unscoped-deep-notes',
          tags: ['Unscoped deep notes'],
          scope: false,
          operations: {
            list: { output: unscopedDeepNoteResponseSchema },
            create: {
              input: unscopedDeepNoteCreateSchema,
              output: unscopedDeepNoteResponseSchema,
            },
          },
        }),
        notes: defineSubResource<GrandchildEntity>({
          key: 'grandchild',
          entity: GrandchildEntity,
          parentKey: 'childId',
          segment: 'notes',
          tags: ['Grandchildren'],
          owner: 'userId',
          operations: {
            list: { output: grandchildResponseSchema },
            create: {
              input: grandchildCreateSchema,
              output: grandchildResponseSchema,
            },
          },
        }),
      },
    }),
    childrenNoReload: defineSubResource<ChildNoReloadEntity>({
      key: 'childNoReload',
      entity: ChildNoReloadEntity,
      segment: 'children-no-reload',
      tags: ['Children (no reload)'],
      // Default behaviour: `reloadAfterCreate` is OFF, so the eager
      // relation should be absent on the create response.
      owner: 'userId',
      relations: (rel) => [rel(CategoryEntity, 'category')],
      operations: {
        list: { output: childResponseSchema },
        create: { input: childCreateSchema, output: childResponseSchema },
      },
    }),
    // All-server-stamped child: the create body is `{}` and the row is
    // filled by PathScopeHook (parentId) + OwnerStampHook (userId).
    stamps: defineSubResource<StampEntity>({
      key: 'stamp',
      entity: StampEntity,
      tags: ['Stamps'],
      owner: 'userId',
      hooks: [OwnerStampHook.for(StampEntity)],
      operations: {
        list: { output: stampResponseSchema },
        create: { input: stampCreateSchema, output: stampResponseSchema },
      },
    }),
    // Three levels deep: the leaf's guard verifies its parent through the
    // MIDDLE's own `PathScopeHook`, which is why the middle may not be
    // `scope: false` (refused at definition time — pinned below).
    looseMiddles: defineSubResource<LooseMiddleEntity>({
      key: 'looseMiddle',
      entity: LooseMiddleEntity,
      segment: 'loose-middles',
      tags: ['Loose middles'],
      operations: {
        list: { output: looseMiddleResponseSchema },
        create: {
          input: looseMiddleCreateSchema,
          output: looseMiddleResponseSchema,
        },
      },
      subResources: {
        looseLeaves: defineSubResource<LooseLeafEntity>({
          key: 'looseLeaf',
          entity: LooseLeafEntity,
          parentKey: 'looseMiddleId',
          segment: 'loose-leaves',
          tags: ['Loose leaves'],
          owner: false,
          operations: {
            list: { output: looseLeafResponseSchema },
            create: {
              input: looseLeafCreateSchema,
              output: looseLeafResponseSchema,
            },
          },
        }),
      },
    }),
    // `scope: false` drops the FK filter hook AND the ownership guard.
    // It does NOT drop the parent's `:param` from the CRUD route params,
    // so writes still take `parentId` from the URL — pinned below.
    unscopedNotes: defineSubResource<UnscopedNoteEntity>({
      key: 'unscopedNote',
      entity: UnscopedNoteEntity,
      segment: 'unscoped-notes',
      tags: ['Unscoped notes'],
      scope: false,
      operations: {
        list: { output: unscopedNoteResponseSchema },
        read: { output: unscopedNoteResponseSchema },
        create: {
          input: unscopedNoteCreateSchema,
          output: unscopedNoteResponseSchema,
        },
        update: {
          input: unscopedNoteCreateSchema,
          output: unscopedNoteResponseSchema,
        },
        delete: { returnDeleted: true },
      },
    }),
  },
});

const plainItemResource = defineResource<PlainItemEntity>({
  key: 'plainItem',
  entity: PlainItemEntity,
  path: 'plain-items',
  tags: ['PlainItems'],
  hooks: [PlainItemOwnerStamp],
  // No eager relation, no AfterCreateReloadHook — proves the path
  // works fine without it.
  operations: {
    list: { output: plainItemResponseSchema },
    read: { output: plainItemResponseSchema },
    create: { input: plainItemCreateSchema, output: plainItemResponseSchema },
    delete: { soft: true, returnDeleted: true },
  },
});

// Categories are populated directly via repository so we avoid the
// auth scope on a public-tag pattern. We mount a minimal resource so
// `relation()` validation finds the entity in the entity index.
const categoryResource = defineResource<CategoryEntity>({
  key: 'category',
  entity: CategoryEntity,
  path: 'categories',
  tags: ['Categories'],
  public: true,
  operations: {
    list: { output: categoryResponseSchema },
    read: { output: categoryResponseSchema },
    create: { input: categoryCreateSchema, output: categoryResponseSchema },
  },
});

// ── Spec ──

describe('RocketsCoreModule + defineSubResource + AfterCreateReloadHook (e2e)', () => {
  let app: INestApplication;
  let categoryAId: string;
  let categoryBId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [
            CategoryEntity,
            ParentEntity,
            ChildEntity,
            ChildNoReloadEntity,
            GrandchildEntity,
            StampEntity,
            UnscopedNoteEntity,
            UnscopedDeepNoteEntity,
            LooseMiddleEntity,
            LooseLeafEntity,
            PlainItemEntity,
          ],
          synchronize: true,
          dropSchema: true,
        }),
        MetaModule,
        RocketsCoreModule.forRoot({
          auth: defineAuthAdapter(StubAuthAdapter),
          providers: [StubAuthAdapter],
          repository: TypeOrmRepositoryModule,
          resources: [categoryResource, parentResource, plainItemResource],
          global: true,
        }),
      ],
      providers: [{ provide: APP_GUARD, useClass: AuthServerGuard }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    // Seed two categories so we can attach them to parents/children.
    const a = await request(app.getHttpServer())
      .post('/categories')
      .set('Authorization', 'Bearer u1')
      .send({ label: 'A' })
      .expect(201);
    categoryAId = a.body.id;
    const b = await request(app.getHttpServer())
      .post('/categories')
      .set('Authorization', 'Bearer u1')
      .send({ label: 'B' })
      .expect(201);
    categoryBId = b.body.id;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  /**
   * Retires a parent through the dynamic repository rather than an HTTP
   * route: the parent resource exposes no update operation, and the
   * point of the test is the READ path, not how the flag is set.
   */
  async function retireParent(id: string): Promise<void> {
    const repo = app.get<RepositoryInterface<ParentEntity>>(
      getDynamicRepositoryToken('parent'),
    );
    const parent = await repo.findOne({
      where: Where.eq<ParentEntity>('id', id),
    });
    if (!parent) throw new Error(`parent ${id} not found`);
    await repo.update(parent, { retired: true });
  }

  // ── Top-level: WITH eager relation + manual reload hook ──

  describe('top-level resource WITH eager relation + manual AfterCreateReloadHook', () => {
    it('create response includes the loaded eager relation', async () => {
      const res = await request(app.getHttpServer())
        .post('/parents')
        .set('Authorization', 'Bearer u1')
        .send({ name: 'p-with-cat', categoryId: categoryAId })
        .expect(201);

      expect(res.body).toMatchObject({
        name: 'p-with-cat',
        categoryId: categoryAId,
        category: { id: categoryAId, label: 'A' },
      });
    });

    it('list returns data with relations available via join', async () => {
      const res = await request(app.getHttpServer())
        .get('/parents')
        .set('Authorization', 'Bearer u1')
        .expect(200);

      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0]).toHaveProperty('name');
    });

    it('soft delete sets dateDeleted and returns the entity', async () => {
      const created = await request(app.getHttpServer())
        .post('/parents')
        .set('Authorization', 'Bearer u1')
        .send({ name: 'p-soft', categoryId: categoryAId })
        .expect(201);

      const del = await request(app.getHttpServer())
        .delete(`/parents/${created.body.id}`)
        .set('Authorization', 'Bearer u1')
        .expect(200);

      expect(del.body.id).toBe(created.body.id);
      expect(del.body.dateDeleted).toBeTruthy();
    });
  });

  // ── Top-level: WITHOUT eager relation, no reload hook ──

  describe('top-level resource WITHOUT eager relation', () => {
    it('create + list + read work with no reload hook attached', async () => {
      const created = await request(app.getHttpServer())
        .post('/plain-items')
        .set('Authorization', 'Bearer u1')
        .send({ name: 'plain-1' })
        .expect(201);
      expect(created.body.name).toBe('plain-1');

      const list = await request(app.getHttpServer())
        .get('/plain-items')
        .set('Authorization', 'Bearer u1')
        .expect(200);
      expect(list.body.data.length).toBeGreaterThan(0);

      const read = await request(app.getHttpServer())
        .get(`/plain-items/${created.body.id}`)
        .set('Authorization', 'Bearer u1')
        .expect(200);
      expect(read.body.id).toBe(created.body.id);
    });

    it('soft delete works on no-relation resource', async () => {
      const created = await request(app.getHttpServer())
        .post('/plain-items')
        .set('Authorization', 'Bearer u1')
        .send({ name: 'plain-soft' })
        .expect(201);

      const del = await request(app.getHttpServer())
        .delete(`/plain-items/${created.body.id}`)
        .set('Authorization', 'Bearer u1')
        .expect(200);

      expect(del.body.dateDeleted).toBeTruthy();
    });
  });

  // ── Sub-resource: auto reload (default) ──

  describe('sub-resource (auto-injected reload + guard)', () => {
    let parentId: string;

    beforeAll(async () => {
      const parent = await request(app.getHttpServer())
        .post('/parents')
        .set('Authorization', 'Bearer u1')
        .send({ name: 'parent-for-children' })
        .expect(201);
      parentId = parent.body.id;
    });

    it('create on /parents/:parentId/children returns child WITH eager category (auto reload)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/parents/${parentId}/children`)
        .set('Authorization', 'Bearer u1')
        .send({ title: 'c1', categoryId: categoryAId })
        .expect(201);

      expect(res.body).toMatchObject({
        title: 'c1',
        parentId,
        categoryId: categoryAId,
        category: { id: categoryAId, label: 'A' },
      });
    });

    it('documents the sub-resource create body as a $ref to its named component', () => {
      const document = app.get(SwaggerUiService).createDocument(app);
      const body =
        document.paths['/parents/{parentId}/children']?.post?.requestBody;
      const schema =
        body !== undefined && 'content' in body
          ? body.content['application/json']?.schema
          : undefined;
      expect(schema).toEqual({ $ref: '#/components/schemas/ChildCreateDto' });
      expect(document.components?.schemas?.ChildCreateDto).toMatchObject({
        type: 'object',
        required: ['title', 'categoryId'],
      });
    });

    // The validated body is the contract: a create that validates to `{}`
    // is a valid create, and the hooks fill the row. Upstream answered it
    // with a bare 400 until nestjs-modules#466.
    it('create with an empty body on an all-server-stamped sub-resource is a 201', async () => {
      const res = await request(app.getHttpServer())
        .post(`/parents/${parentId}/stamps`)
        .set('Authorization', 'Bearer u1')
        .send({});
      expect(res.status, JSON.stringify(res.body)).toBe(201);

      expect(res.body).toMatchObject({ parentId, userId: 'u1' });
      expect(typeof res.body.id).toBe('string');

      const list = await request(app.getHttpServer())
        .get(`/parents/${parentId}/stamps`)
        .set('Authorization', 'Bearer u1')
        .expect(200);
      expect(list.body.data).toHaveLength(1);
      expect(list.body.data[0].id).toBe(res.body.id);
    });

    // `scope: false` drops the `PathScopeHook` and the ownership guard —
    // it does NOT make the route unscoped. The parent's `:param` stays a
    // CRUD route param whose `field` is the FK column, and upstream uses
    // it BOTH ways: `buildWhere` turns it into a `Where.eq` on every read,
    // and the adapter merges it over the body on every write.
    it('scope: false still stamps the FK from the URL on create', async () => {
      const other = await request(app.getHttpServer())
        .post('/parents')
        .set('Authorization', 'Bearer u1')
        .send({ name: 'other-parent' })
        .expect(201);

      // Body omits the FK entirely.
      const bare = await request(app.getHttpServer())
        .post(`/parents/${parentId}/unscoped-notes`)
        .set('Authorization', 'Bearer u1')
        .send({ label: 'from-url' });
      expect(bare.status, JSON.stringify(bare.body)).toBe(201);
      expect(bare.body.parentId).toBe(parentId);

      // Body names a DIFFERENT parent — the URL still wins.
      const conflicting = await request(app.getHttpServer())
        .post(`/parents/${parentId}/unscoped-notes`)
        .set('Authorization', 'Bearer u1')
        .send({ label: 'url-wins', parentId: other.body.id })
        .expect(201);
      expect(conflicting.body.parentId).toBe(parentId);
    });

    // The other half, and the one the name `scope: false` gets wrong:
    // reads stay FK-filtered too, because `buildWhere` turns every route
    // param into a `Where.eq`. `scope: false` drops the ownership CLAUSE
    // in the guard — it does not drop the guard, so the parent must
    // still exist and must still be visible to its own hooks.
    it('scope: false keeps reads FK-filtered and still requires a visible parent', async () => {
      const other = await request(app.getHttpServer())
        .post('/parents')
        .set('Authorization', 'Bearer u1')
        .send({ name: 'read-scope-parent' })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/parents/${other.body.id}/unscoped-notes`)
        .set('Authorization', 'Bearer u1')
        .send({ label: 'under-other' })
        .expect(201);

      const mine = await request(app.getHttpServer())
        .get(`/parents/${parentId}/unscoped-notes`)
        .set('Authorization', 'Bearer u1')
        .expect(200);

      // The row created under `other` is NOT visible here.
      for (const row of mine.body.data) {
        expect(row.parentId).toBe(parentId);
      }

      // A parent that does not exist is a 404, not an empty list — the
      // guard's existence check runs with no ownership clause.
      await request(app.getHttpServer())
        .get('/parents/00000000-0000-4000-8000-000000000000/unscoped-notes')
        .set('Authorization', 'Bearer u1')
        .expect(404);

      // The parent's OWN visibility hooks still gate the route: this
      // parent is actor-scoped, so u2 cannot reach its notes even though
      // the sub-resource itself is not owner-guarded.
      await request(app.getHttpServer())
        .get(`/parents/${parentId}/unscoped-notes`)
        .set('Authorization', 'Bearer u2')
        .expect(404);
    });

    // Every write verb resolves its target through `getOneOrFail` →
    // `buildWhere`, so the FK clause applies there too: addressing a row
    // through the WRONG parent is a 404, not an unfiltered write.
    it('scope: false makes a cross-parent update/delete a 404', async () => {
      const other = await request(app.getHttpServer())
        .post('/parents')
        .set('Authorization', 'Bearer u1')
        .send({ name: 'write-verb-parent' })
        .expect(201);

      const note = await request(app.getHttpServer())
        .post(`/parents/${parentId}/unscoped-notes`)
        .set('Authorization', 'Bearer u1')
        .send({ label: 'mine' })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/parents/${other.body.id}/unscoped-notes/${note.body.id}`)
        .set('Authorization', 'Bearer u1')
        .send({ label: 'hijacked' })
        .expect(404);

      await request(app.getHttpServer())
        .delete(`/parents/${other.body.id}/unscoped-notes/${note.body.id}`)
        .set('Authorization', 'Bearer u1')
        .expect(404);

      // Untouched through its own parent.
      const still = await request(app.getHttpServer())
        .get(`/parents/${parentId}/unscoped-notes/${note.body.id}`)
        .set('Authorization', 'Bearer u1')
        .expect(200);
      expect(still.body.label).toBe('mine');
    });

    // The chain guarantee at depth three: route params only filter by the
    // IMMEDIATE parent, so the leaf guard's parent lookup — replaying the
    // middle's own `PathScopeHook` — is the only thing that rejects a
    // middle row addressed through the wrong grandparent.
    it('a leaf is not reachable through the wrong grandparent', async () => {
      const other = await request(app.getHttpServer())
        .post('/parents')
        .set('Authorization', 'Bearer u1')
        .send({ name: 'loose-other' })
        .expect(201);

      const middleOfOther = await request(app.getHttpServer())
        .post(`/parents/${other.body.id}/loose-middles`)
        .set('Authorization', 'Bearer u1')
        .send({ title: 'under-other' })
        .expect(201);

      await request(app.getHttpServer())
        .post(
          `/parents/${other.body.id}/loose-middles/${middleOfOther.body.id}/loose-leaves`,
        )
        .set('Authorization', 'Bearer u1')
        .send({ label: 'leaf' })
        .expect(201);

      // The MIDDLE's own route is still FK-filtered by the route param,
      // so addressing it through the wrong parent is a 404.
      await request(app.getHttpServer())
        .get(`/parents/${parentId}/loose-middles/${middleOfOther.body.id}`)
        .set('Authorization', 'Bearer u1')
        .expect(404);

      // The LEAF route through the wrong ancestor: the leaf guard looks
      // the middle up with the middle's own FK filter replayed, so the
      // middle is not found under this parent and the leaf is not served.
      await request(app.getHttpServer())
        .get(
          `/parents/${parentId}/loose-middles/${middleOfOther.body.id}/loose-leaves`,
        )
        .set('Authorization', 'Bearer u1')
        .expect(404);
    });

    // That guarantee is exactly what `scope: false` on the middle level
    // removes, and nothing about the middle's own routes shows it. The
    // definition is refused instead.
    it('refuses subResources under a scope: false level', () => {
      expect(() =>
        defineResource<ParentEntity>({
          key: 'refusingParent',
          entity: ParentEntity,
          path: 'refusing-parents',
          operations: { list: { output: parentResponseSchema } },
          subResources: {
            looseMiddles: defineSubResource<LooseMiddleEntity>({
              key: 'looseMiddle',
              entity: LooseMiddleEntity,
              segment: 'loose-middles',
              scope: false,
              operations: { list: { output: looseMiddleResponseSchema } },
              subResources: {
                looseLeaves: defineSubResource<LooseLeafEntity>({
                  key: 'looseLeaf',
                  entity: LooseLeafEntity,
                  parentKey: 'looseMiddleId',
                  segment: 'loose-leaves',
                  operations: { list: { output: looseLeafResponseSchema } },
                }),
              },
            }),
          },
        }),
      ).toThrow(/`scope: false` and declares subResources/);
    });

    it('list /parents/:parentId/children scopes by :parentId', async () => {
      const res = await request(app.getHttpServer())
        .get(`/parents/${parentId}/children`)
        .set('Authorization', 'Bearer u1')
        .expect(200);

      expect(res.body.data.length).toBeGreaterThan(0);
      for (const row of res.body.data) {
        expect(row.parentId).toBe(parentId);
      }
    });

    it('read /parents/:parentId/children/:id returns child', async () => {
      const created = await request(app.getHttpServer())
        .post(`/parents/${parentId}/children`)
        .set('Authorization', 'Bearer u1')
        .send({ title: 'c-read', categoryId: categoryAId })
        .expect(201);

      const read = await request(app.getHttpServer())
        .get(`/parents/${parentId}/children/${created.body.id}`)
        .set('Authorization', 'Bearer u1')
        .expect(200);

      expect(read.body.id).toBe(created.body.id);
    });

    it('soft delete on sub returns the soft-deleted child', async () => {
      const created = await request(app.getHttpServer())
        .post(`/parents/${parentId}/children`)
        .set('Authorization', 'Bearer u1')
        .send({ title: 'c-del', categoryId: categoryAId })
        .expect(201);

      const del = await request(app.getHttpServer())
        .delete(`/parents/${parentId}/children/${created.body.id}`)
        .set('Authorization', 'Bearer u1')
        .expect(200);

      expect(del.body.dateDeleted).toBeTruthy();
    });

    it('PathScopeGuard blocks an actor that does not own the parent', async () => {
      // Parent was created by u1; u2 tries to access it.
      await request(app.getHttpServer())
        .get(`/parents/${parentId}/children`)
        .set('Authorization', 'Bearer u2')
        .expect(404); // intentional 404 (cannot probe existence)
    });

    it('PathScopeGuard blocks unauthenticated requests', async () => {
      await request(app.getHttpServer())
        .get(`/parents/${parentId}/children`)
        .expect(401);
    });
  });

  // ── Sub-resource: opted out of reload ──

  describe('sub-resource with reloadAfterCreate OFF (default)', () => {
    let parentId: string;

    beforeAll(async () => {
      const parent = await request(app.getHttpServer())
        .post('/parents')
        .set('Authorization', 'Bearer u1')
        .send({ name: 'parent-no-reload' })
        .expect(201);
      parentId = parent.body.id;
    });

    it('create response does NOT include the eager relation when reloadAfterCreate is off', async () => {
      const res = await request(app.getHttpServer())
        .post(`/parents/${parentId}/children-no-reload`)
        .set('Authorization', 'Bearer u1')
        .send({ title: 'no-reload', categoryId: categoryBId })
        .expect(201);

      expect(res.body.title).toBe('no-reload');
      expect(res.body.categoryId).toBe(categoryBId);
      // TypeORM `save()` returns persisted columns only — no eager
      // load happens because we opted out of the reload hook.
      expect(res.body.category).toBeUndefined();
    });
  });
  // ── Sub-resource: parent hidden by a PARENT read hook (#45) ──

  describe('parent hidden by its own read hook hides the sub-resource', () => {
    let parentId: string;
    let childId: string;

    beforeAll(async () => {
      const parent = await request(app.getHttpServer())
        .post('/parents')
        .set('Authorization', 'Bearer u1')
        .send({ name: 'to-be-retired', categoryId: categoryAId })
        .expect(201);
      parentId = parent.body.id;

      const child = await request(app.getHttpServer())
        .post(`/parents/${parentId}/children`)
        .set('Authorization', 'Bearer u1')
        .send({ title: 'child-of-retired', categoryId: categoryAId })
        .expect(201);
      childId = child.body.id;
    });

    it('the sub-resource is reachable while the parent is live', async () => {
      await request(app.getHttpServer())
        .get(`/parents/${parentId}/children`)
        .set('Authorization', 'Bearer u1')
        .expect(200);
    });

    it('retiring the parent hides it from its own routes', async () => {
      await retireParent(parentId);

      await request(app.getHttpServer())
        .get(`/parents/${parentId}`)
        .set('Authorization', 'Bearer u1')
        .expect(404);
    });

    // Regression for #45: the guard's parent lookup used to omit `ctx`,
    // so it ran with every parent hook disabled and a retired parent
    // still served (and minted) child rows.
    it('list on the sub-resource of a retired parent is 404', async () => {
      await request(app.getHttpServer())
        .get(`/parents/${parentId}/children`)
        .set('Authorization', 'Bearer u1')
        .expect(404);
    });

    it('create on the sub-resource of a retired parent is 404', async () => {
      await request(app.getHttpServer())
        .post(`/parents/${parentId}/children`)
        .set('Authorization', 'Bearer u1')
        .send({ title: 'should-not-exist', categoryId: categoryAId })
        .expect(404);
    });

    it('read on the sub-resource of a retired parent is 404', async () => {
      await request(app.getHttpServer())
        .get(`/parents/${parentId}/children/${childId}`)
        .set('Authorization', 'Bearer u1')
        .expect(404);
    });

    it('delete on the sub-resource of a retired parent is 404', async () => {
      await request(app.getHttpServer())
        .delete(`/parents/${parentId}/children/${childId}`)
        .set('Authorization', 'Bearer u1')
        .expect(404);
    });
  });
  // ── Sub-resource: parent hook gated on the ACTOR (#45) ──

  describe('the guard replay carries the actor to parent hooks', () => {
    let parentId: string;

    beforeAll(async () => {
      const parent = await request(app.getHttpServer())
        .post('/parents')
        .set('Authorization', 'Bearer u1')
        .send({ name: 'actor-scoped-parent' })
        .expect(201);
      parentId = parent.body.id;
    });

    // `ParentActorScopeHook` fails closed without an actor, so a 200
    // here is only reachable if the guard's detached context exposed
    // one. Guards run before `ActorOverlay`, so this cannot come from
    // the request's own overlay.
    it('an actor-scoped parent hook resolves the actor during the lookup', async () => {
      await request(app.getHttpServer())
        .post(`/parents/${parentId}/children`)
        .set('Authorization', 'Bearer u1')
        .send({ title: 'actor-scoped-child', categoryId: categoryAId })
        .expect(201);

      await request(app.getHttpServer())
        .get(`/parents/${parentId}/children`)
        .set('Authorization', 'Bearer u1')
        .expect(200);
    });
  });

  // ── Three-level nesting: the middle resource's own scope hook (#45) ──

  describe('grandchild routes stay scoped to the addressed middle row', () => {
    let parentA: string;
    let parentB: string;
    let childOfB: string;

    beforeAll(async () => {
      const a = await request(app.getHttpServer())
        .post('/parents')
        .set('Authorization', 'Bearer u1')
        .send({ name: 'A', categoryId: categoryAId })
        .expect(201);
      parentA = a.body.id;

      const b = await request(app.getHttpServer())
        .post('/parents')
        .set('Authorization', 'Bearer u1')
        .send({ name: 'B', categoryId: categoryAId })
        .expect(201);
      parentB = b.body.id;

      const child = await request(app.getHttpServer())
        .post(`/parents/${parentB}/children`)
        .set('Authorization', 'Bearer u1')
        .send({ title: 'child-of-B', categoryId: categoryAId })
        .expect(201);
      childOfB = child.body.id;
    });

    it('serves the grandchild collection on the correct path', async () => {
      await request(app.getHttpServer())
        .get(`/parents/${parentB}/children/${childOfB}/notes`)
        .set('Authorization', 'Bearer u1')
        .expect(200);
    });

    // Both rows belong to the same actor, so the ownership half of the
    // guard passes. Only the child's own `PathScopeHook` — replayed on
    // the grandchild guard's parent lookup — rejects the mismatched
    // `:parentId`. It needs the route params to do that.
    it('rejects a child reached through the wrong parent', async () => {
      await request(app.getHttpServer())
        .get(`/parents/${parentA}/children/${childOfB}/notes`)
        .set('Authorization', 'Bearer u1')
        .expect(404);
    });

    it('rejects a write through the wrong parent', async () => {
      await request(app.getHttpServer())
        .post(`/parents/${parentA}/children/${childOfB}/notes`)
        .set('Authorization', 'Bearer u1')
        .send({ label: 'should-not-exist' })
        .expect(404);
    });

    // The same path with `scope: false` on the DEEP resource. Ancestor
    // params are `disabled: true`, so `:parentId` never reaches
    // `buildWhere` — the guard's parent lookup, replaying the child's own
    // `PathScopeHook`, is the ONLY thing that can reject a middle row
    // addressed through the wrong ancestor. `scope: false` used to drop
    // that guard outright and serve the rows; it now drops only the
    // ownership clause, so the chain is still verified.
    it('scope: false still verifies the ancestor chain at depth 3', async () => {
      const created = await request(app.getHttpServer())
        .post(`/parents/${parentB}/children/${childOfB}/unscoped-deep-notes`)
        .set('Authorization', 'Bearer u1')
        .send({ label: 'deep' })
        .expect(201);
      expect(created.body.childId).toBe(childOfB);

      // Reachable through its OWN ancestor.
      const own = await request(app.getHttpServer())
        .get(`/parents/${parentB}/children/${childOfB}/unscoped-deep-notes`)
        .set('Authorization', 'Bearer u1')
        .expect(200);
      expect(own.body.data.map((row: { id: string }) => row.id)).toContain(
        created.body.id,
      );

      // Addressed through parentA, which does NOT contain childOfB —
      // the same 404 the scoped `notes` route answers.
      await request(app.getHttpServer())
        .get(`/parents/${parentA}/children/${childOfB}/unscoped-deep-notes`)
        .set('Authorization', 'Bearer u1')
        .expect(404);

      // And a write through the wrong ancestor is refused too.
      await request(app.getHttpServer())
        .post(`/parents/${parentA}/children/${childOfB}/unscoped-deep-notes`)
        .set('Authorization', 'Bearer u1')
        .send({ label: 'should-not-exist' })
        .expect(404);
    });
  });
});
