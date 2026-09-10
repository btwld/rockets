/**
 * E2E coverage for per-operation `input` / `output` on the zod resource
 * path (issue #57 — parity with the class path).
 *
 * The class path has always accepted per-operation DTO classes; the zod
 * path only had the single schema-derived projection, so an app had to
 * choose between controlled projection and automatic OpenAPI. These
 * specs pin the three things that choice was costing:
 *
 *  1. `input` narrows the accepted request body — extra keys are
 *     stripped, and a field the resource schema requires can be dropped
 *     from one operation without touching the resource.
 *  2. `output` narrows the serialized response per operation (a list
 *     projection that is deliberately thinner than the read one).
 *  3. The overrides reach the OpenAPI document, not just runtime
 *     behaviour, and the untouched operations keep the derived schemas.
 *     Both sides are `$ref`'d components — since nestjs-modules#467
 *     upstream documents CRUD bodies through the converter like every
 *     response — so body assertions resolve the ref into `components`.
 *
 * The last block covers the same behaviour on the CLASS path. Per-operation
 * `output` was accepted there but never reached the route: upstream reads
 * `response.resource` from the controller only, so `defineResource` now
 * stamps the route-level metadata. Both paths are pinned here so they
 * cannot drift apart again.
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
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { TypeOrmRepositoryModule } from '@concepta/rockets-repository-typeorm';
import { getDynamicRepositoryToken } from '@concepta/nestjs-repository';
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
import { USER_METADATA_MODULE_ENTITY_KEY } from '../rockets-core.constants';
import { AuthServerGuard } from '../infrastructure/guards/auth-server.guard';
import { defineAuthAdapter } from '../infrastructure/auth/define-auth-adapter';
import { baseEntity, f, zodResource, zodSubResource } from '../zod';
import { defineResource } from '../infrastructure/resource/define-resource';
import { createRocketsStandardSchemaConverter } from '../common/swagger-ui/rockets-standard-schema.converter';

// ── Auth / metadata fixtures ──

/** `f.owner()` is a uuid column and the response schema validates the row. */
const U1_ID = '00000000-0000-4000-8000-000000000001';

@Injectable()
class StubAuthAdapter implements AuthAdapterInterface {
  async authenticate(request: AuthRequest): Promise<AuthAttemptResult> {
    const token = extractBearerToken(request);
    if (token === null) return { matched: false };
    if (token === 'u1') {
      return { matched: true, user: { id: U1_ID, sub: U1_ID } };
    }
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

// ── Entities ──
//
// Handwritten rather than schema-compiled: this spec lives inside
// rockets-core, and the TypeORM zod compiler resolves
// `@concepta/rockets-core/zod` to the BUILT package, so its field-meta
// registry is a different instance from the `src` one these fixtures
// register into. Entity compilation is covered in the adapter package;
// what is under test here is the DTO/operation surface.

@Entity('io_articles')
class ArticleEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar' }) title!: string;
  @Column({ type: 'varchar' }) body!: string;
  @Column({ type: 'varchar', nullable: true }) slug?: string;
  @Column({ type: 'varchar' }) userId!: string;
  @CreateDateColumn() dateCreated!: Date;
  @UpdateDateColumn() dateUpdated!: Date;
  comments?: CommentEntity[];
}

@Entity('io_comments')
class CommentEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar' }) text!: string;
  // Nullable: the create override deliberately does not accept it, so
  // the column must tolerate the narrower body.
  @Column({ type: 'varchar', nullable: true }) authorNote?: string;
  @Column({ type: 'uuid' }) articleId!: string;
  @Column({ type: 'varchar' }) userId!: string;
  @CreateDateColumn() dateCreated!: Date;
  @UpdateDateColumn() dateUpdated!: Date;
}

@Entity('io_widgets')
class WidgetEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar' }) name!: string;
  @Column({ type: 'varchar' }) secretNote!: string;
}

@Entity('io_deriveds')
class DerivedEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar' }) label!: string;
  @CreateDateColumn() dateCreated!: Date;
  @UpdateDateColumn() dateUpdated!: Date;
}

// ── Resources ──

const articleSchema = baseEntity({
  title: f.string(),
  body: f.string(),
  // Required by the resource schema, absent from the create override —
  // that combination is the point of the first block below. `nullable`
  // because the response schema validates the ROW, and a row created
  // through the override carries `slug: null`.
  slug: f.string().nullable(),
  userId: f.owner(),
});

/** Sub-resource: the override plumbing must reach it too. */
const commentSchema = baseEntity({
  text: f.string(),
  // `nullish`: the nullable column reads back as `null`, which the
  // response schema must accept.
  authorNote: f.string().nullish(),
  articleId: f.string(),
  userId: f.owner(),
});

/**
 * `create` accepts title + body only (slug is server-derived on this
 * route), and `list` returns a deliberately thin card projection while
 * `read` keeps the full derived response.
 */
const articleResource = zodResource({
  name: 'Article',
  schema: articleSchema,
  entity: ArticleEntity,
  path: 'articles',
  tags: ['Articles'],
  operations: {
    list: {
      output: z.object({ id: z.uuid(), title: z.string() }),
    },
    read: true,
    // `slug` is derived server-side, so it is not part of this body.
    create: {
      input: z.object({ title: z.string(), body: z.string() }),
    },
    // Both halves on one operation, and a response narrower than the
    // resource projection.
    update: {
      input: z.object({ title: z.string() }),
      output: z.object({ id: z.uuid(), title: z.string() }),
    },
    // A HARD delete that answers 200 with the removed row — upstream
    // decides the status from `returnDeleted` alone, `soft` is not
    // required. `id` is deliberately absent from the projection: the ORM
    // clears the primary key on the entity it returns from a hard
    // remove, so documenting it would document a null.
    delete: {
      returnDeleted: true,
      output: z.object({ title: z.string() }),
    },
  },
  hooks: [],
  subResources: {
    comments: zodSubResource({
      name: 'Comment',
      schema: commentSchema,
      entity: CommentEntity,
      parentKey: 'articleId',
      segment: 'comments',
      tags: ['Comments'],
      operations: {
        // Narrower than the derived projection: `authorNote` must not
        // appear on the collection route.
        list: { output: z.object({ id: z.uuid(), text: z.string() }) },
        create: { input: z.object({ text: z.string() }), strictInput: true },
      },
    }),
  },
});

/** Control resource: no overrides anywhere, derived DTOs must survive. */
const derivedSchema = baseEntity({
  label: f.string(),
});

const derivedResource = zodResource({
  name: 'Derived',
  schema: derivedSchema,
  entity: DerivedEntity,
  path: 'deriveds',
  tags: ['Deriveds'],
  operations: ['list', 'read', 'create'],
});

// ── strictInput (issue #79): unknown keys become 400, not silence ──

@Entity('io_strict')
class StrictEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar' }) label!: string;
  @Column({ type: 'varchar', nullable: true }) note?: string;
  @CreateDateColumn() dateCreated!: Date;
  @UpdateDateColumn() dateUpdated!: Date;
}

const strictSchema = baseEntity({
  label: f.string(),
  note: f.string().nullish(),
});

const strictResource = zodResource({
  name: 'Strict',
  schema: strictSchema,
  entity: StrictEntity,
  path: 'stricts',
  tags: ['Stricts'],
  operations: {
    list: true,
    read: true,
    // Derived projection + strictInput: the flag must work without an
    // `input` override, or every strict consumer re-declares the schema
    // the projection already derived — the duplication #79 files against.
    create: { strictInput: true },
    // Override + strictInput: the flag applies to WHICHEVER schema wins.
    update: {
      input: z.object({ label: z.string() }),
      strictInput: true,
    },
    // Replace deliberately NOT strict: the default keeps stripping, so
    // one resource can mix both contracts and the flag stays per-op.
    replace: true,
  },
});

/**
 * The shapes the first fixture leaves open: strict REPLACE (shares the
 * create projection — the echo-back case), strict derived UPDATE (the
 * partial projection), and a nested override pinning that `.strict()`
 * is top-level only.
 */
@Entity('io_strict_echo')
class StrictEchoEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar' }) label!: string;
  @Column({ type: 'varchar', nullable: true }) meta?: string;
  @CreateDateColumn() dateCreated!: Date;
  @UpdateDateColumn() dateUpdated!: Date;
}

// `nullish`, not `optional`: the nullable column echoes back as
// `meta: null`, which must round-trip through the input schema so the
// strict-replace test's 400 is attributable to `.strict()` alone.
const strictEchoSchema = baseEntity({
  label: f.string(),
  meta: f.string().nullish(),
});

const strictEchoResource = zodResource({
  name: 'StrictEcho',
  schema: strictEchoSchema,
  entity: StrictEchoEntity,
  path: 'strict-echoes',
  tags: ['StrictEchoes'],
  operations: {
    read: true,
    create: {
      // Nested object in an override under strict: zod's `.strict()`
      // applies to the TOP level only — `bogus` inside `nested` is
      // stripped, not rejected. Pinned so the doc's "top-level only"
      // caveat is a tested fact, not a guess.
      input: z.object({
        label: z.string(),
        nested: z.object({ a: z.string() }).optional(),
      }),
      strictInput: true,
    },
    update: { strictInput: true },
    replace: { strictInput: true },
  },
});

// ── Core-path resource (same feature, hand-named schemas instead of a
// zodResource projection) ──

const widgetCreateSchema = withOpenApi(
  z.object({ name: z.string(), secretNote: z.string() }),
  'WidgetCreateDto',
);

const widgetReadSchema = withOpenApi(
  z.object({ id: z.uuid(), name: z.string(), secretNote: z.string() }),
  'WidgetReadDto',
);

/** Deliberately thinner than the read schema — the list route must use it. */
const widgetCardSchema = withOpenApi(
  z.object({ id: z.uuid(), name: z.string() }),
  'WidgetCardDto',
);

const widgetResource = defineResource<WidgetEntity>({
  key: 'widget',
  entity: WidgetEntity,
  path: 'widgets',
  tags: ['Widgets'],
  operations: {
    list: { output: widgetCardSchema },
    read: { output: widgetReadSchema },
    create: { input: widgetCreateSchema, output: widgetReadSchema },
  },
});

// ── Spec ──

describe('zodResource per-operation input/output (e2e)', () => {
  let app: INestApplication;
  let components: Record<string, unknown>;
  let paths: Record<string, unknown>;
  let articleId: string;

  interface JsonSchemaLike {
    readonly properties?: Record<string, unknown>;
    readonly required?: string[];
    readonly additionalProperties?: unknown;
  }

  /**
   * The JSON Schema of a route's request body, resolved through its
   * component. Upstream documents generated CRUD bodies as a `$ref` to
   * `components/schemas/<id>` (nestjs-modules#467), the same as responses.
   */
  const requestBody = (path: string, method: 'post' | 'patch' | 'put') => {
    const route = paths[path] as
      | Record<
          string,
          { requestBody?: { content?: Record<string, { schema?: unknown }> } }
        >
      | undefined;
    const schema =
      route?.[method]?.requestBody?.content?.['application/json']?.schema;
    if (schema === undefined) {
      throw new Error(`no request body documented on ${method} ${path}`);
    }
    const ref = (schema as { $ref?: unknown }).$ref;
    if (typeof ref !== 'string') {
      throw new Error(
        `request body on ${method} ${path} is inlined, expected a $ref`,
      );
    }
    const id = ref.replace('#/components/schemas/', '');
    const component = components[id];
    if (component === undefined) {
      throw new Error(`request body component "${id}" is not registered`);
    }
    return component as JsonSchemaLike;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [
            ArticleEntity,
            CommentEntity,
            DerivedEntity,
            WidgetEntity,
            StrictEntity,
            StrictEchoEntity,
          ],
          synchronize: true,
          dropSchema: true,
        }),
        MetaModule,
        RocketsCoreModule.forRoot({
          auth: defineAuthAdapter(StubAuthAdapter),
          providers: [StubAuthAdapter],
          repository: TypeOrmRepositoryModule,
          resources: [
            articleResource,
            derivedResource,
            widgetResource,
            strictResource,
            strictEchoResource,
          ],
          global: true,
        }),
      ],
      providers: [{ provide: APP_GUARD, useClass: AuthServerGuard }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    // The Rockets converter is what `SwaggerUiService.createDocument`
    // installs: every named schema becomes a `components.schemas` entry.
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('io').build(),
      { standardSchemaConverter: createRocketsStandardSchemaConverter() },
    );
    components = (document.components?.schemas ?? {}) as Record<
      string,
      unknown
    >;
    paths = document.paths as Record<string, unknown>;

    const created = await request(app.getHttpServer())
      .post('/articles')
      .set('Authorization', 'Bearer u1')
      .send({ title: 'first', body: 'body-text' })
      .expect(201);
    articleId = created.body.id;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  describe('input override', () => {
    it('accepts a body that omits a field the resource schema requires', async () => {
      // Without the override this body is a 400: `slug` is required by
      // `articleSchema`, so the derived create DTO demands it.
      const res = await request(app.getHttpServer())
        .post('/articles')
        .set('Authorization', 'Bearer u1')
        .send({ title: 'no-slug', body: 'text' })
        .expect(201);
      expect(res.body.title).toBe('no-slug');
    });

    it('the derived create body would have required it', () => {
      expect(requestBody('/articles', 'post').required?.sort()).toEqual([
        'body',
        'title',
      ]);
      // Control: the un-overridden resource still documents its own
      // required set, so the assertion above is about the override.
      expect(requestBody('/deriveds', 'post').required).toContain('label');
    });

    it('strips keys the override does not declare', async () => {
      const res = await request(app.getHttpServer())
        .post('/articles')
        .set('Authorization', 'Bearer u1')
        .send({ title: 'second', body: 'more', slug: 'client-supplied' })
        .expect(201);

      // `slug` is not part of the create contract on this route, so a
      // client-supplied value must not be persisted — the column stays
      // at its default rather than carrying 'client-supplied'.
      const read = await request(app.getHttpServer())
        .get(`/articles/${res.body.id}`)
        .set('Authorization', 'Bearer u1')
        .expect(200);
      expect(read.body.slug).toBeNull();
    });

    it('rejects a body missing a field the override requires', async () => {
      await request(app.getHttpServer())
        .post('/articles')
        .set('Authorization', 'Bearer u1')
        .send({ title: 'no-body' })
        .expect(400);
    });
  });

  describe('update override (input and output on one operation)', () => {
    it('accepts the narrowed body and serializes the narrowed response', async () => {
      const created = await request(app.getHttpServer())
        .post('/articles')
        .set('Authorization', 'Bearer u1')
        .send({ title: 'before', body: 'b' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .patch(`/articles/${created.body.id}`)
        .set('Authorization', 'Bearer u1')
        .send({ title: 'after' })
        .expect(200);

      expect(Object.keys(res.body).sort()).toEqual(['id', 'title']);
      expect(res.body.title).toBe('after');
    });

    it('rejects a body key the update override does not declare', async () => {
      const created = await request(app.getHttpServer())
        .post('/articles')
        .set('Authorization', 'Bearer u1')
        .send({ title: 'strict', body: 'b' })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/articles/${created.body.id}`)
        .set('Authorization', 'Bearer u1')
        .send({ body: 'only-body' })
        .expect(400);
    });
  });

  describe('hard delete returning the removed row', () => {
    it('answers 200 with the override projection', async () => {
      const created = await request(app.getHttpServer())
        .post('/articles')
        .set('Authorization', 'Bearer u1')
        .send({ title: 'doomed', body: 'b' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .delete(`/articles/${created.body.id}`)
        .set('Authorization', 'Bearer u1')
        .expect(200);

      expect(Object.keys(res.body).sort()).toEqual(['title']);
      expect(res.body.title).toBe('doomed');
    });
  });

  describe('output override', () => {
    it('list serializes only the override projection', async () => {
      const res = await request(app.getHttpServer())
        .get('/articles')
        .set('Authorization', 'Bearer u1')
        .expect(200);

      const [first] = res.body.data;
      expect(Object.keys(first).sort()).toEqual(['id', 'title']);
    });

    it('read keeps the schema-derived response', async () => {
      const res = await request(app.getHttpServer())
        .get(`/articles/${articleId}`)
        .set('Authorization', 'Bearer u1')
        .expect(200);

      expect(res.body.title).toBe('first');
      expect(res.body.body).toBe('body-text');
    });
  });

  describe('OpenAPI', () => {
    // A `.strict()` input schema documents `additionalProperties: false`
    // straight from the JSON Schema bridge — no post-processing step.
    it('strict bodies document additionalProperties: false', () => {
      expect(requestBody('/stricts', 'post').additionalProperties).toBe(false);
      // The flag must reach BOTH input sources: the derived projection
      // above and an `input` override (a strict `.strict()` applied to
      // the schema the author supplied).
      expect(requestBody('/strict-echoes', 'post').additionalProperties).toBe(
        false,
      );
      // A non-strict body must NOT gain the keyword — the flag stays
      // per-operation, not document-wide.
      expect(
        requestBody('/deriveds', 'post').additionalProperties,
      ).toBeUndefined();
    });

    it('registers the override output as a named component', () => {
      expect(components).toHaveProperty('ArticleListOutputDto');
      expect(components).toHaveProperty('ArticleListOutputDtoPaginatedDto');
      expect(components).toHaveProperty('ArticleUpdateOutputDto');
    });

    it('documents the override body shape, not the derived one', () => {
      expect(
        Object.keys(requestBody('/articles', 'post').properties ?? {}).sort(),
      ).toEqual(['body', 'title']);
    });

    it('leaves resources without overrides on the derived schemas', () => {
      expect(components).toHaveProperty('DerivedResponseDto');
      expect(components).toHaveProperty('DerivedResponseDtoPaginatedDto');
      expect(components).not.toHaveProperty('DerivedListOutputDto');
      // The derived create body carries every writable column.
      expect(
        Object.keys(requestBody('/deriveds', 'post').properties ?? {}).sort(),
      ).toEqual(['label']);
    });
  });

  describe('zodSubResource carries the overrides too', () => {
    it('accepts the narrowed create body and serializes the narrowed list', async () => {
      await request(app.getHttpServer())
        .post(`/articles/${articleId}/comments`)
        .set('Authorization', 'Bearer u1')
        .send({ text: 'nice' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/articles/${articleId}/comments`)
        .set('Authorization', 'Bearer u1')
        .expect(200);

      const [first] = res.body.data;
      expect(Object.keys(first).sort()).toEqual(['id', 'text']);
    });

    // `compileZodCore` has two callers; `zodResource` alone passing does
    // not prove `zodSubResource` applies `strictInput` too.
    it('applies strictInput on the sub-resource create', async () => {
      const res = await request(app.getHttpServer())
        .post(`/articles/${articleId}/comments`)
        .set('Authorization', 'Bearer u1')
        .send({ text: 'ok', smuggled: true })
        .expect(400);
      expect(JSON.stringify(res.body.message)).toMatch(
        /Unrecognized key.*smuggled/,
      );
    });

    it('documents the sub-resource overrides', () => {
      expect(components).toHaveProperty('CommentListOutputDto');
      const body = requestBody('/articles/{articleId}/comments', 'post');
      expect(Object.keys(body.properties ?? {})).toEqual(['text']);
      expect(body.additionalProperties).toBe(false);
    });
  });

  describe('class path (defineResource) parity', () => {
    let widgetId: string;

    beforeAll(async () => {
      const created = await request(app.getHttpServer())
        .post('/widgets')
        .set('Authorization', 'Bearer u1')
        .send({ name: 'w1', secretNote: 'not-for-lists' })
        .expect(201);
      widgetId = created.body.id;
    });

    it('read serializes the read DTO', async () => {
      const res = await request(app.getHttpServer())
        .get(`/widgets/${widgetId}`)
        .set('Authorization', 'Bearer u1')
        .expect(200);
      expect(res.body.secretNote).toBe('not-for-lists');
    });

    it('list serializes its own thinner DTO', async () => {
      const res = await request(app.getHttpServer())
        .get('/widgets')
        .set('Authorization', 'Bearer u1')
        .expect(200);

      const [first] = res.body.data;
      expect(Object.keys(first).sort()).toEqual(['id', 'name']);
    });

    it('documents the list item shape as the list DTO', () => {
      expect(components).toHaveProperty('WidgetCardDto');
      const card = components.WidgetCardDto as {
        properties: Record<string, unknown>;
      };
      expect(Object.keys(card.properties).sort()).toEqual(['id', 'name']);
    });
  });

  describe('strictInput — unknown create keys are rejected, not stripped (#79)', () => {
    it('400s the exact repro: a declared key plus an unknown one', async () => {
      const res = await request(app.getHttpServer())
        .post('/stricts')
        .set('Authorization', 'Bearer u1')
        .send({ label: 'x', unexpected: 1 })
        .expect(400);

      // The field map names the offending key — a bare 400 would also be
      // satisfied by a missing-required error and prove nothing.
      expect(JSON.stringify(res.body.message)).toMatch(/unexpected/);
    });

    it('still accepts a body with only declared keys', async () => {
      await request(app.getHttpServer())
        .post('/stricts')
        .set('Authorization', 'Bearer u1')
        .send({ label: 'clean', note: 'fine' })
        .expect(201);
    });

    it('applies to an input override on the same resource', async () => {
      const created = await request(app.getHttpServer())
        .post('/stricts')
        .set('Authorization', 'Bearer u1')
        .send({ label: 'target' })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/stricts/${created.body.id}`)
        .set('Authorization', 'Bearer u1')
        .send({ label: 'renamed', sneaky: true })
        .expect(400);
    });

    it('a non-strict op on the same resource keeps the stripping default', async () => {
      const created = await request(app.getHttpServer())
        .post('/stricts')
        .set('Authorization', 'Bearer u1')
        .send({ label: 'loose' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .put(`/stricts/${created.body.id}`)
        .set('Authorization', 'Bearer u1')
        .send({ label: 'replaced', extra: 'dropped' })
        .expect(200);
      expect(res.body).not.toHaveProperty('extra');
    });

    // F2 from review: strict rejects keys the SCHEMA declares but the
    // projection excludes. The idiomatic read-modify-write — GET a row,
    // PUT it back — now 400s, because `id`/`dateCreated`/`dateUpdated`
    // are response-only. Runtime-proved, not inferred from the
    // projection code.
    it('rejects an echoed-back row on strict replace (server-owned keys)', async () => {
      const created = await request(app.getHttpServer())
        .post('/strict-echoes')
        .set('Authorization', 'Bearer u1')
        .send({ label: 'echo' })
        .expect(201);

      // The echoed row carries `meta: null` (nullable column) — the
      // schema's `nullish` accepts it, so the 400 below can only come
      // from `.strict()` naming the server-owned keys.
      const row = await request(app.getHttpServer())
        .get(`/strict-echoes/${created.body.id}`)
        .set('Authorization', 'Bearer u1')
        .expect(200);
      expect(row.body).toMatchObject({ label: 'echo', meta: null });

      const res = await request(app.getHttpServer())
        .put(`/strict-echoes/${created.body.id}`)
        .set('Authorization', 'Bearer u1')
        .send(row.body)
        .expect(400);
      expect(JSON.stringify(res.body.message)).toMatch(/Unrecognized key.*id/);
    });

    it('applies strict to the derived partial update projection', async () => {
      const created = await request(app.getHttpServer())
        .post('/strict-echoes')
        .set('Authorization', 'Bearer u1')
        .send({ label: 'patchme' })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/strict-echoes/${created.body.id}`)
        .set('Authorization', 'Bearer u1')
        .send({ label: 'renamed', sneaky: 1 })
        .expect(400);

      await request(app.getHttpServer())
        .patch(`/strict-echoes/${created.body.id}`)
        .set('Authorization', 'Bearer u1')
        .send({ label: 'renamed' })
        .expect(200);
    });

    // Zod's `.strict()` is TOP-LEVEL only: an unknown key inside a
    // nested object is stripped, not rejected. This pins the documented
    // caveat; if zod ever goes deep-strict, this test says so loudly.
    it('does not reject unknown keys inside nested objects (top-level only)', async () => {
      const res = await request(app.getHttpServer())
        .post('/strict-echoes')
        .set('Authorization', 'Bearer u1')
        .send({ label: 'nested', nested: { a: 'ok', bogus: 1 } })
        .expect(201);
      expect(res.body).toBeDefined();
    });

    it('rejects strictInput on an operation with no request body', () => {
      expect(() =>
        zodResource({
          name: 'StrictMisuse',
          schema: strictSchema,
          entity: StrictEntity,
          path: 'strict-misuse',
          tags: ['StrictMisuse'],
          operations: { list: true, read: { strictInput: true } },
        }),
      ).toThrow(/strictInput.*"read".*no request body/);
    });
  });
});
