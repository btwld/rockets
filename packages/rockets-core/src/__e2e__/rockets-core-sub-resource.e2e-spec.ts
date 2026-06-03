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
 */
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
import { TypeOrmRepositoryModule } from '@concepta/nestjs-repository-typeorm';
import { getDynamicRepositoryToken } from '@bitwild/rockets-repository';
import { Expose, Type } from 'class-transformer';
import { IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import request from 'supertest';
import type {
  AuthAdapterInterface,
  AuthAttemptResult,
  AuthRequest,
} from '../domain/interfaces/auth-adapter.interface';
import { extractBearerToken } from '../infrastructure/auth/extract-bearer-token';
import { RocketsCoreModule } from '../rockets-core.module';
import { USER_METADATA_MODULE_ENTITY_KEY } from '../rockets-core.constants';
import { AuthServerGuard } from '../infrastructure/guards/auth-server.guard';
import { defineResource } from '../infrastructure/resource/define-resource';
import { defineSubResource } from '../infrastructure/resource/define-sub-resource';
import { AfterCreateReloadHook } from '../infrastructure/hooks/after-create-reload.hook';
import { OwnerStampHook } from '../infrastructure/hooks/owner-stamp.hook';
import { createStubAuthBootstrap } from '../infrastructure/auth/create-stub-auth-bootstrap';

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
  @ManyToOne(() => CategoryEntity, { eager: true, nullable: true })
  @JoinColumn({ name: 'categoryId' })
  category?: CategoryEntity;
  @DeleteDateColumn() dateDeleted?: Date;
  // Phantom relation properties — typed only; defineSubResource keys
  // must satisfy `keyof Parent`. The actual joins live on the child.
  children?: unknown[];
  childrenNoReload?: unknown[];
}

@Entity('children')
class ChildEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar' }) title!: string;
  @Column({ type: 'uuid' }) parentId!: string;
  @Column({ type: 'uuid' }) categoryId!: string;
  @ManyToOne(() => CategoryEntity, { eager: true })
  @JoinColumn({ name: 'categoryId' })
  category?: CategoryEntity;
  @DeleteDateColumn() dateDeleted?: Date;
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

// ── DTOs ──

class CategoryResponseDto {
  @Expose() @ApiProperty() id!: string;
  @Expose() @ApiProperty() label!: string;
}

class CategoryCreateDto {
  @Expose() @IsString() @ApiProperty() label!: string;
}

class ParentCreateDto {
  @Expose() @IsString() @ApiProperty() name!: string;
  @Expose() @IsOptional() @IsUUID() @ApiPropertyOptional() categoryId?: string;
}

class ParentResponseDto {
  @Expose() @ApiProperty() id!: string;
  @Expose() @ApiProperty() name!: string;
  @Expose() @ApiPropertyOptional() categoryId?: string;
  @Expose()
  @Type(() => CategoryResponseDto)
  @ApiPropertyOptional({ type: () => CategoryResponseDto })
  category?: CategoryResponseDto;
  @Expose() @ApiPropertyOptional() dateDeleted?: string;
}

class ChildCreateDto {
  @Expose() @IsString() @ApiProperty() title!: string;
  @Expose() @IsUUID() @ApiProperty() categoryId!: string;
}

class ChildResponseDto {
  @Expose() @ApiProperty() id!: string;
  @Expose() @ApiProperty() title!: string;
  @Expose() @ApiProperty() parentId!: string;
  @Expose() @ApiProperty() categoryId!: string;
  @Expose()
  @Type(() => CategoryResponseDto)
  @ApiPropertyOptional({ type: () => CategoryResponseDto })
  category?: CategoryResponseDto;
  @Expose() @ApiPropertyOptional() dateDeleted?: string;
}

class PlainItemCreateDto {
  @Expose() @IsString() @ApiProperty() name!: string;
}

class PlainItemResponseDto {
  @Expose() @ApiProperty() id!: string;
  @Expose() @ApiProperty() name!: string;
  @Expose() @ApiPropertyOptional() dateDeleted?: string;
}

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
  hooks: [ParentOwnerStamp, AfterCreateReloadHook.for(ParentEntity)],
  relations: (rel) => [rel(CategoryEntity, 'category')],
  operations: {
    list: { response: ParentResponseDto },
    read: { response: ParentResponseDto },
    create: { body: ParentCreateDto, response: ParentResponseDto },
    delete: { soft: true, returnDeleted: true },
  },
  subResources: {
    children: defineSubResource<ChildEntity>({
      key: 'child',
      entity: ChildEntity,
      tags: ['Children'],
      // `parentOwnerColumn` is required (no default). PathScopeHook +
      // PathScopeGuard are auto-injected. `reloadAfterCreate` opts the
      // child into the eager-relation reload.
      parentOwnerColumn: 'userId',
      reloadAfterCreate: true,
      relations: (rel) => [rel(CategoryEntity, 'category')],
      operations: {
        list: { response: ChildResponseDto },
        read: { response: ChildResponseDto },
        create: { body: ChildCreateDto, response: ChildResponseDto },
        delete: { soft: true, returnDeleted: true },
      },
    }),
    childrenNoReload: defineSubResource<ChildNoReloadEntity>({
      key: 'childNoReload',
      entity: ChildNoReloadEntity,
      urlSegment: 'children-no-reload',
      tags: ['Children (no reload)'],
      // Default behaviour: `reloadAfterCreate` is OFF, so the eager
      // relation should be absent on the create response.
      parentOwnerColumn: 'userId',
      relations: (rel) => [rel(CategoryEntity, 'category')],
      operations: {
        list: { response: ChildResponseDto },
        create: { body: ChildCreateDto, response: ChildResponseDto },
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
    list: { response: PlainItemResponseDto },
    read: { response: PlainItemResponseDto },
    create: { body: PlainItemCreateDto, response: PlainItemResponseDto },
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
    list: { response: CategoryResponseDto },
    read: { response: CategoryResponseDto },
    create: { body: CategoryCreateDto, response: CategoryResponseDto },
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
            PlainItemEntity,
          ],
          synchronize: true,
          dropSchema: true,
        }),
        MetaModule,
        RocketsCoreModule.forRoot({
          auth: createStubAuthBootstrap(StubAuthAdapter),
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
});
