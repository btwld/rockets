/**
 * e2e regression cover for the three round-2 HIGH findings.
 *
 * Persistence uses handwritten TypeORM entities so this suite does not
 * depend on `@concepta/rockets-repository-typeorm/zod` resolving the
 * same zod registry as local `src/zod` (dist vs src WeakMap split).
 * Schema → DTO projection still goes through `zodResource`.
 *
 * 1. CWE-863 — `zodResource` + `f.owner()` must auto-scope list/read
 * 2. CWE-200 — non-base fields need `dto.response:true` to appear
 * 3. CWE-284 — PathScopeGuard must block cross-owner nested access.
 *    Asserted over HTTP (u2 gets 404 on u1's children), not by
 *    inspecting a metadata mirror that the builder sets itself.
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
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TypeOrmRepositoryModule } from '@concepta/rockets-repository-typeorm';
import { withOpenApi } from '@concepta/nestjs-core';
import { getDynamicRepositoryToken } from '@concepta/nestjs-repository';
import request from 'supertest';
import { z } from 'zod';
import type {
  AuthAdapterInterface,
  AuthAttemptResult,
  AuthRequest,
} from '../domain/interfaces/auth-adapter.interface';
import { extractBearerToken } from '../infrastructure/auth/extract-bearer-token';
import { RocketsCoreModule } from '../rockets-core.module';
import { USER_METADATA_MODULE_ENTITY_KEY } from '../rockets-core.constants';
import { AuthServerGuard } from '../infrastructure/guards/auth-server.guard';
import { defineAuthAdapter } from '../infrastructure/auth/define-auth-adapter';
import {
  EntityHook,
  PassthroughEntityHookBase,
} from '../infrastructure/hooks/entity-hook';
import { OwnerStampHook } from '../infrastructure/hooks/owner-stamp.hook';
import { defineResource } from '../infrastructure/resource/define-resource';
import { defineSubResource } from '../infrastructure/resource/define-sub-resource';
import { asClassicSchema, baseEntity, f, zodResource } from '../zod';

// ── Auth / metadata ──

/**
 * Real uuids: `f.owner()` is `z.uuid()` and the response schema VALIDATES
 * the row on the way out, so a non-uuid owner id is a 500, not a pass.
 */
const U1 = '00000000-0000-4000-8000-0000000000a1';
const U2 = '00000000-0000-4000-8000-0000000000a2';

@Injectable()
class StubAuthAdapter implements AuthAdapterInterface {
  async authenticate(request: AuthRequest): Promise<AuthAttemptResult> {
    const token = extractBearerToken(request);
    if (token === null) return { matched: false };
    if (token === 'u1') return { matched: true, user: { id: U1, sub: U1 } };
    if (token === 'u2') return { matched: true, user: { id: U2, sub: U2 } };
    return { matched: true, error: new UnauthorizedException() };
  }
}

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

// ── Zod note resource (handwritten entity + schema DTOs) ──

@Entity('sec_notes')
class NoteEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar' }) title!: string;
  @Column({ type: 'varchar' }) internalNote!: string;
  @Column({ type: 'varchar' }) userId!: string;
  @CreateDateColumn() dateCreated!: Date;
  @UpdateDateColumn() dateUpdated!: Date;
}

/**
 * Compute element schema carrying a hidden column — the PR-review repro:
 * the compute callback returns rows that include `internalNote`
 * (response: false) plus a key never declared at all. Neither may reach
 * the wire, while the computed field itself MUST (a regression once
 * dropped the whole field silently).
 */
const noteRefShape = z.object({
  label: f.string(),
  internalNote: f.string({ dto: { response: false } }),
});

const noteSchema = baseEntity({
  title: f.string(),
  /** Write-only — must stay out of the response DTO (HIGH CWE-200). */
  internalNote: f.string({ dto: { response: false } }),
  userId: f.owner(),
  refs: f
    .compute(z.array(noteRefShape), (row) => [
      {
        label: `ref-${String(row.title)}`,
        internalNote: 'compute-must-not-leak',
        undeclaredColumn: 'undeclared-must-not-leak',
      },
    ])
    .optional(),
});

const noteResource = zodResource({
  name: 'Note',
  schema: noteSchema,
  entity: NoteEntity,
  path: 'notes',
  tags: ['Notes'],
  operations: ['list', 'read', 'create'],
});

/**
 * Declared keys of a response schema. A resource with computed fields
 * wraps its object in a `z.preprocess` pipe, so the object is the pipe's
 * `out` side.
 */
function responseSchemaKeys(schema: z.ZodType): string[] {
  const object =
    schema instanceof z.ZodPipe
      ? asClassicSchema(schema.def.out, 'response')
      : schema;
  if (!(object instanceof z.ZodObject)) {
    throw new Error('expected an object response schema');
  }
  return Object.keys(object.shape);
}

describe('zod security HIGHs (e2e RED) — owner scope + response exposure', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [NoteEntity],
          synchronize: true,
          dropSchema: true,
        }),
        MetaModule,
        RocketsCoreModule.forRoot({
          auth: defineAuthAdapter(StubAuthAdapter),
          providers: [StubAuthAdapter],
          repository: TypeOrmRepositoryModule,
          resources: [noteResource],
          global: true,
        }),
      ],
      providers: [{ provide: APP_GUARD, useClass: AuthServerGuard }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  describe('HIGH CWE-863 — OwnerScope auto-wire via zodResource', () => {
    it('list is owner-scoped: u2 must not see u1 notes', async () => {
      const created = await request(app.getHttpServer())
        .post('/notes')
        .set('Authorization', 'Bearer u1')
        .send({ title: 'u1-private', internalNote: 'u1-secret' })
        .expect(201);

      expect(created.body.userId).toBe(U1);

      const list = await request(app.getHttpServer())
        .get('/notes')
        .set('Authorization', 'Bearer u2')
        .expect(200);

      const ids = (list.body.data as ReadonlyArray<{ id: string }>).map(
        (row) => row.id,
      );
      expect(ids).not.toContain(created.body.id);
    });

    it('read is owner-scoped: u2 must not read u1 note by id', async () => {
      const created = await request(app.getHttpServer())
        .post('/notes')
        .set('Authorization', 'Bearer u1')
        .send({ title: 'u1-read-private', internalNote: 'x' })
        .expect(201);

      await request(app.getHttpServer())
        .get(`/notes/${created.body.id}`)
        .set('Authorization', 'Bearer u2')
        .expect(404);
    });
  });

  describe('HIGH CWE-200 — response DTO opt-in', () => {
    it('compiled response schema omits non-base fields without dto.response:true', () => {
      const keys = responseSchemaKeys(
        noteResource.zod.schemas.response.resource,
      );
      expect(keys).toEqual(
        expect.arrayContaining(['id', 'title', 'dateCreated', 'dateUpdated']),
      );
      expect(keys).not.toContain('internalNote');
    });

    /**
     * Wire-level proof for the computed-field projection (PR-review HIGH):
     * the field must be PRESENT (a rebuilt schema once lost its meta
     * registration and the field vanished from responses entirely) and
     * must carry only declared, non-hidden keys — through the real
     * serializer pipeline, not plainToInstance in isolation.
     */
    it('computed field reaches the wire minus hidden and undeclared keys', async () => {
      const created = await request(app.getHttpServer())
        .post('/notes')
        .set('Authorization', 'Bearer u1')
        .send({ title: 'compute-check', internalNote: 'x' })
        .expect(201);

      const read = await request(app.getHttpServer())
        .get(`/notes/${created.body.id}`)
        .set('Authorization', 'Bearer u1')
        .expect(200);

      expect(read.body.refs).toEqual([{ label: 'ref-compute-check' }]);
      const ref = (read.body.refs as Record<string, unknown>[])[0];
      expect(ref).not.toHaveProperty('internalNote');
      expect(ref).not.toHaveProperty('undeclaredColumn');
    });

    it('HTTP create/read responses omit internalNote', async () => {
      const created = await request(app.getHttpServer())
        .post('/notes')
        .set('Authorization', 'Bearer u1')
        .send({ title: 'leak-check', internalNote: 'must-not-leak' })
        .expect(201);

      expect(created.body).toHaveProperty('title', 'leak-check');
      expect(created.body).not.toHaveProperty('internalNote');

      const read = await request(app.getHttpServer())
        .get(`/notes/${created.body.id}`)
        .set('Authorization', 'Bearer u1')
        .expect(200);

      expect(read.body).not.toHaveProperty('internalNote');
    });
  });
});

// ── PathScope (classic) ──

@Entity('sec_parents')
class SecParentEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar' }) name!: string;
  @Column({ type: 'varchar' }) userId!: string;
  children?: SecChildEntity[];
}

@Entity('sec_children')
class SecChildEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar' }) title!: string;
  @Column({ type: 'uuid' }) parentId!: string;
}

const secParentCreateSchema = withOpenApi(
  z.object({ name: z.string() }),
  'SecParentCreateDto',
);
const secParentResponseSchema = withOpenApi(
  z.object({ id: z.uuid(), name: z.string(), userId: z.string() }),
  'SecParentResponseDto',
);
const secChildCreateSchema = withOpenApi(
  z.object({ title: z.string() }),
  'SecChildCreateDto',
);
const secChildResponseSchema = withOpenApi(
  z.object({ id: z.uuid(), title: z.string(), parentId: z.uuid() }),
  'SecChildResponseDto',
);

@EntityHook()
@Injectable()
class CustomChildHook extends PassthroughEntityHookBase<SecChildEntity> {}

const ParentOwnerStamp = OwnerStampHook.for(SecParentEntity);

const secParentResource = defineResource<SecParentEntity>({
  key: 'secParent',
  entity: SecParentEntity,
  path: 'sec-parents',
  tags: ['SecParents'],
  hooks: [ParentOwnerStamp],
  operations: {
    list: { output: secParentResponseSchema },
    read: { output: secParentResponseSchema },
    create: { input: secParentCreateSchema, output: secParentResponseSchema },
  },
  subResources: {
    children: defineSubResource<SecChildEntity>({
      key: 'secChild',
      entity: SecChildEntity,
      parentKey: 'parentId',
      tags: ['SecChildren'],
      owner: 'userId',
      hooks: [CustomChildHook],
      operations: {
        list: { output: secChildResponseSchema },
        create: { input: secChildCreateSchema, output: secChildResponseSchema },
      },
    }),
  },
});

describe('HIGH CWE-284 — PathScope with consumer hooks still enforces (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [SecParentEntity, SecChildEntity],
          synchronize: true,
          dropSchema: true,
        }),
        MetaModule,
        RocketsCoreModule.forRoot({
          auth: defineAuthAdapter(StubAuthAdapter),
          providers: [StubAuthAdapter],
          repository: TypeOrmRepositoryModule,
          resources: [secParentResource],
          global: true,
        }),
      ],
      providers: [{ provide: APP_GUARD, useClass: AuthServerGuard }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('still blocks cross-owner sub-resource access when consumer hooks are present', async () => {
    const parent = await request(app.getHttpServer())
      .post('/sec-parents')
      .set('Authorization', 'Bearer u1')
      .send({ name: 'p1' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/sec-parents/${parent.body.id}/children`)
      .set('Authorization', 'Bearer u1')
      .send({ title: 'c1' })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/sec-parents/${parent.body.id}/children`)
      .set('Authorization', 'Bearer u2')
      .expect(404);
  });
});
