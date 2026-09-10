/**
 * Falsification cover for the schema engine (RFC #104, stage 4): every
 * request body validates through Nest's Standard Schema pipe with the
 * Rockets exception factory, every response is serialized by its named
 * schema, and the OpenAPI document `$ref`s components by id.
 *
 * Persistence uses handwritten TypeORM entities (entity override) for the
 * same reason `rockets-core-zod-security.e2e-spec.ts` does: the dist
 * `@concepta/rockets-repository-typeorm/zod` compiler reads the dist copy
 * of the field-meta registry, not this package's `src/zod` one.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  Global,
  INestApplication,
  Injectable,
  Module,
  type PlainLiteralObject,
  StandardSchemaValidationPipe,
  UnauthorizedException,
} from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
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
import { defineHook } from '../infrastructure/hooks/define-hook';
import { RocketsCoreExceptionsFilter } from '../infrastructure/filters/exceptions.filter';
import {
  detailedErrorSerializer,
  ROCKETS_ERROR_SERIALIZER_TOKEN,
} from '../infrastructure/filters/error-serializer';
import { SwaggerUiService } from '../common/swagger-ui/swagger-ui.service';
import { baseEntity, f, zodResource } from '../zod';

// ── Auth / metadata ──

@Injectable()
class StubAuthAdapter implements AuthAdapterInterface {
  async authenticate(request: AuthRequest): Promise<AuthAttemptResult> {
    const token = extractBearerToken(request);
    if (token === null) return { matched: false };
    if (token === 'ok') {
      return {
        matched: true,
        user: {
          id: '00000000-0000-4000-8000-0000000000a1',
          sub: '00000000-0000-4000-8000-0000000000a1',
        },
      };
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

// ── Resources ──

@Entity('engine_tags')
class TagEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar' }) label!: string;
  @Column({ type: 'datetime' }) expiresAt!: Date;
  @CreateDateColumn() dateCreated!: Date;
  @UpdateDateColumn() dateUpdated!: Date;
}

@Entity('engine_strict_tags')
class StrictTagEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar' }) label!: string;
  @Column({ type: 'datetime' }) expiresAt!: Date;
  @CreateDateColumn() dateCreated!: Date;
  @UpdateDateColumn() dateUpdated!: Date;
}

/**
 * Grafts a column the schema never declared onto every row the CRUD
 * layer hands back. If the response were the raw row (or a class
 * serializer with `excludeExtraneousValues` off), `leakedColumn` would
 * reach the client.
 */
const LEAKED = 'hook-column-must-not-leak';
const TagLeakHook = defineHook<PlainLiteralObject>(TagEntity, {
  afterFindOne: (row) =>
    row === null ? row : Object.assign(row, { leakedColumn: LEAKED }),
  afterCreate: (row) => Object.assign(row, { leakedColumn: LEAKED }),
});

const tagResource = zodResource({
  name: 'Tag',
  schema: baseEntity({ label: f.string(), expiresAt: f.date() }),
  entity: TagEntity,
  path: 'tags',
  tags: ['Tags'],
  operations: ['list', 'read', 'create', 'update', 'replace'],
  hooks: [TagLeakHook],
});

const strictTagResource = zodResource({
  name: 'StrictTag',
  schema: baseEntity({ label: f.string(), expiresAt: f.date() }),
  entity: StrictTagEntity,
  path: 'strict-tags',
  tags: ['StrictTags'],
  operations: {
    read: true,
    create: { strictInput: true },
    update: { strictInput: true },
    replace: { strictInput: true },
  },
});

const EXPIRES = '2030-01-02T03:04:05.000Z';

/** Walks a nested unknown (the OpenAPI document) without casts. */
function at(value: unknown, ...path: string[]): unknown {
  return path.reduce<unknown>(
    (acc, key) =>
      typeof acc === 'object' && acc !== null
        ? Reflect.get(acc, key)
        : undefined,
    value,
  );
}

function detailPaths(body: unknown): (string | number)[][] {
  const details = at(body, 'details');
  if (!Array.isArray(details)) {
    throw new Error(`expected details[], got ${JSON.stringify(body)}`);
  }
  return details.map((detail: unknown) => {
    const path = at(detail, 'path');
    if (!Array.isArray(path) || typeof at(detail, 'message') !== 'string') {
      throw new Error(`malformed detail ${JSON.stringify(detail)}`);
    }
    return path as (string | number)[];
  });
}

describe('schema engine — validation, serialization, OpenAPI (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [TagEntity, StrictTagEntity],
          synchronize: true,
          dropSchema: true,
        }),
        MetaModule,
        RocketsCoreModule.forRoot({
          auth: defineAuthAdapter(StubAuthAdapter),
          providers: [StubAuthAdapter],
          repository: TypeOrmRepositoryModule,
          resources: [tagResource, strictTagResource],
          global: true,
        }),
      ],
      providers: [
        { provide: APP_GUARD, useClass: AuthServerGuard },
        { provide: APP_FILTER, useClass: RocketsCoreExceptionsFilter },
        {
          provide: ROCKETS_ERROR_SERIALIZER_TOKEN,
          useValue: detailedErrorSerializer,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  const post = (path: string, body: object) =>
    request(app.getHttpServer())
      .post(path)
      .set('Authorization', 'Bearer ok')
      .send(body);

  async function createTag(path = '/tags'): Promise<{ id: string }> {
    const res = await post(path, { label: 'seed', expiresAt: EXPIRES }).expect(
      201,
    );
    return { id: res.body.id };
  }

  describe('(a) request bodies validate through the Standard Schema pipe', () => {
    it('create: {} is a 400 with one detail per missing field', async () => {
      const res = await post('/tags', {}).expect(400);
      expect(res.body.statusCode).toBe(400);
      expect(detailPaths(res.body)).toEqual(
        expect.arrayContaining([['label'], ['expiresAt']]),
      );
    });

    it('replace: {} is a 400 with details', async () => {
      const { id } = await createTag();
      const res = await request(app.getHttpServer())
        .put(`/tags/${id}`)
        .set('Authorization', 'Bearer ok')
        .send({})
        .expect(400);
      expect(detailPaths(res.body)).toEqual(
        expect.arrayContaining([['label'], ['expiresAt']]),
      );
    });

    it('update: a wrong value type is a 400 addressed at the field', async () => {
      const { id } = await createTag();
      const res = await request(app.getHttpServer())
        .patch(`/tags/${id}`)
        .set('Authorization', 'Bearer ok')
        .send({ label: 123 })
        .expect(400);
      expect(detailPaths(res.body)).toEqual([['label']]);
    });

    it('create: an unknown key is stripped, not rejected and not echoed', async () => {
      const res = await post('/tags', {
        label: 'lenient',
        expiresAt: EXPIRES,
        bogus: 'dropped',
      }).expect(201);
      expect(res.body.label).toBe('lenient');
      expect(res.body).not.toHaveProperty('bogus');
    });

    it('create with strictInput: an unknown key is a 400 naming the key', async () => {
      const res = await post('/strict-tags', {
        label: 'strict',
        expiresAt: EXPIRES,
        bogus: 'rejected',
      }).expect(400);
      expect(detailPaths(res.body)).toEqual([['bogus']]);
      expect(res.body.details[0].message).toContain('bogus');
    });

    it('update with strictInput: an unknown key is a 400 naming the key', async () => {
      const { id } = await createTag('/strict-tags');
      const res = await request(app.getHttpServer())
        .patch(`/strict-tags/${id}`)
        .set('Authorization', 'Bearer ok')
        .send({ bogus: 'rejected' })
        .expect(400);
      expect(detailPaths(res.body)).toEqual([['bogus']]);
    });

    it('replace with strictInput: an unknown key is a 400 naming the key', async () => {
      const { id } = await createTag('/strict-tags');
      const res = await request(app.getHttpServer())
        .put(`/strict-tags/${id}`)
        .set('Authorization', 'Bearer ok')
        .send({ label: 'x', expiresAt: EXPIRES, bogus: 'rejected' })
        .expect(400);
      expect(detailPaths(res.body)).toEqual([['bogus']]);
    });
  });

  describe('(b) responses are the schema, not the row', () => {
    it('a column grafted by a hook never reaches the wire', async () => {
      const created = await post('/tags', {
        label: 'hooked',
        expiresAt: EXPIRES,
      }).expect(201);
      expect(created.body).not.toHaveProperty('leakedColumn');

      const read = await request(app.getHttpServer())
        .get(`/tags/${created.body.id}`)
        .set('Authorization', 'Bearer ok')
        .expect(200);
      expect(read.body.label).toBe('hooked');
      expect(read.body).not.toHaveProperty('leakedColumn');
      expect(JSON.stringify(read.body)).not.toContain(LEAKED);
    });
  });

  describe('(d) date columns serialize as ISO strings', () => {
    it('f.date() and f.createdAt() are ISO strings on create and read', async () => {
      const created = await post('/tags', {
        label: 'dated',
        expiresAt: EXPIRES,
      }).expect(201);
      expect(created.body.expiresAt).toBe(EXPIRES);
      expect(typeof created.body.dateCreated).toBe('string');
      expect(new Date(created.body.dateCreated).toISOString()).toBe(
        created.body.dateCreated,
      );

      const read = await request(app.getHttpServer())
        .get(`/tags/${created.body.id}`)
        .set('Authorization', 'Bearer ok')
        .expect(200);
      expect(read.body.expiresAt).toBe(EXPIRES);
      expect(read.body.dateCreated).toBe(created.body.dateCreated);
    });

    // Bare `z.coerce.date()` turns `null` / booleans into the epoch and
    // persists 1970 — a validation hole, not a coercion.
    it('f.date() rejects null and booleans with a 400 addressed at the field', async () => {
      for (const expiresAt of [null, false, true]) {
        const res = await post('/tags', { label: 'x', expiresAt });
        expect(res.status, JSON.stringify(res.body)).toBe(400);
        expect(detailPaths(res.body)).toEqual([['expiresAt']]);
      }
    });

    it('f.date() still coerces a numeric timestamp and an ISO string', async () => {
      const numeric = await post('/tags', {
        label: 'numeric',
        expiresAt: new Date(EXPIRES).getTime(),
      });
      expect(numeric.status, JSON.stringify(numeric.body)).toBe(201);
      expect(numeric.body.expiresAt).toBe(EXPIRES);

      const iso = await post('/tags', { label: 'iso', expiresAt: EXPIRES });
      expect(iso.status, JSON.stringify(iso.body)).toBe(201);
      expect(iso.body.expiresAt).toBe(EXPIRES);

      for (const expiresAt of ['', '2020-13-45', [], {}]) {
        const res = await post('/tags', { label: 'x', expiresAt });
        expect(res.status, JSON.stringify(res.body)).toBe(400);
      }
    });
  });

  describe('(e) OpenAPI components are referenced by id', () => {
    it('TagResponseDto exists, is closed, and the list 200 refs its paginated envelope', () => {
      const document = app.get(SwaggerUiService).createDocument(app);
      const schemas = document.components?.schemas ?? {};

      const response = at(schemas, 'TagResponseDto');
      expect(response).toBeDefined();
      expect(at(response, 'additionalProperties')).toBe(false);
      expect(at(response, 'properties', 'expiresAt', 'format')).toBe(
        'date-time',
      );

      expect(
        at(
          document.paths,
          '/tags',
          'get',
          'responses',
          '200',
          'content',
          'application/json',
          'schema',
          '$ref',
        ),
      ).toBe('#/components/schemas/TagResponseDtoPaginatedDto');
      expect(
        at(
          schemas,
          'TagResponseDtoPaginatedDto',
          'properties',
          'data',
          'items',
          '$ref',
        ),
      ).toBe('#/components/schemas/TagResponseDto');
    });

    /**
     * Generated CRUD bodies go through the document converter like every
     * response, so each is a `$ref` to its own component. Upstream
     * stamped them as an INLINE `ApiBody({ schema })` that Swagger merged
     * over the reflected `@Body({ schema })` until
     * conceptadev/nestjs-modules#467; `8.0.0-alpha.10` stamps
     * `ApiBody({ standardSchema })` instead.
     */
    it('generated CRUD request bodies are $ref components (create / update / replace)', () => {
      const document = app.get(SwaggerUiService).createDocument(app);
      const schemas = document.components?.schemas ?? {};
      const bodyRef = (path: string, method: string) =>
        at(
          document.paths,
          path,
          method,
          'requestBody',
          'content',
          'application/json',
          'schema',
          '$ref',
        );

      expect(bodyRef('/tags', 'post')).toBe(
        '#/components/schemas/TagCreateDto',
      );
      expect(bodyRef('/tags/{id}', 'patch')).toBe(
        '#/components/schemas/TagUpdateDto',
      );
      expect(bodyRef('/tags/{id}', 'put')).toBe(
        '#/components/schemas/TagReplaceDto',
      );
      expect(
        at(document.paths, '/tags', 'post', 'requestBody', 'required'),
      ).toBe(true);
      for (const id of ['TagCreateDto', 'TagUpdateDto', 'TagReplaceDto']) {
        expect(at(schemas, id, 'type')).toBe('object');
      }
      expect(at(schemas, 'TagCreateDto', 'required')).toEqual([
        'label',
        'expiresAt',
      ]);
    });

    it('a strictInput body component is documented with additionalProperties: false', () => {
      const document = app.get(SwaggerUiService).createDocument(app);
      const schemas = document.components?.schemas ?? {};
      expect(
        at(
          document.paths,
          '/strict-tags',
          'post',
          'requestBody',
          'content',
          'application/json',
          'schema',
          '$ref',
        ),
      ).toBe('#/components/schemas/StrictTagCreateDto');
      expect(at(schemas, 'StrictTagCreateDto', 'additionalProperties')).toBe(
        false,
      );
      expect(at(schemas, 'StrictTagCreateDto', 'required')).toEqual([
        'label',
        'expiresAt',
      ]);
      expect(
        at(schemas, 'TagCreateDto', 'additionalProperties'),
      ).toBeUndefined();
    });
  });
});

describe('(c) an open compute schema is rejected at definition time', () => {
  it('zodResource throws on a .passthrough() compute schema', () => {
    class OpenEntity {
      id!: string;
    }
    expect(() =>
      zodResource({
        name: 'Open',
        schema: baseEntity({
          label: f.string(),
          extra: f.compute(z.object({ a: z.string() }).passthrough(), () => ({
            a: 'x',
          })),
        }),
        entity: OpenEntity,
        operations: ['read'],
      }),
    ).toThrow(/is open at "\$\.extra"/);
  });
});

describe('(f) a global StandardSchemaValidationPipe fails boot', () => {
  it('app.init() rejects with the SchemaValidatorConflictCheck message', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [],
          synchronize: true,
          dropSchema: true,
        }),
        MetaModule,
        RocketsCoreModule.forRoot({
          auth: defineAuthAdapter(StubAuthAdapter),
          providers: [StubAuthAdapter],
          repository: TypeOrmRepositoryModule,
          resources: [],
          global: true,
        }),
      ],
    }).compile();

    const app = moduleRef.createNestApplication();
    app.useGlobalPipes(new StandardSchemaValidationPipe());
    try {
      await expect(app.init()).rejects.toThrow(
        /global StandardSchemaValidationPipe/,
      );
    } finally {
      await app.close().catch(() => undefined);
    }
  });
});
