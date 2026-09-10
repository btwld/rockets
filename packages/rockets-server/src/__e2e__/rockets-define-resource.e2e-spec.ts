import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  INestApplication,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import request from 'supertest';
import { z } from 'zod';
import {
  SwaggerUiService,
  extractBearerToken,
  withOpenApi,
} from '@concepta/rockets-core';
import type {
  AuthAdapterInterface,
  AuthAttemptResult,
  AuthRequest,
} from '@concepta/rockets-core';
import { RocketsModule } from '../rockets.module';
import { defineResource } from '@concepta/rockets-core';
import { TypeOrmRepositoryModule } from '@concepta/rockets-repository-typeorm';
import { userMetadataConfigFixture } from '../__fixtures__/schemas/user-metadata.schema.fixture';
import { E2eFakeRepositoryModule } from './helpers/e2e-fake-repository.module';
import { e2eAuthBootstrap } from '../__fixtures__/providers/e2e-auth-bootstrap.fixture';

// ────────────────────────────────────────────────────────────────────
// Test Entity — a stand-alone "gadget" resource for this suite.
// ────────────────────────────────────────────────────────────────────

@Entity('gadgets')
class GadgetEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  category?: string;

  @CreateDateColumn()
  dateCreated!: Date;

  @UpdateDateColumn()
  dateUpdated!: Date;
}

const gadgetCreateSchema = withOpenApi(
  z.object({ name: z.string(), category: z.string().optional() }),
  'GadgetCreateDto',
);

const gadgetUpdateSchema = withOpenApi(
  z.object({ name: z.string().optional(), category: z.string().optional() }),
  'GadgetUpdateDto',
);

// `dateUpdated` is deliberately undeclared: the response schema is the
// wire contract, so the column must be stripped.
const gadgetResponseSchema = withOpenApi(
  z.object({
    id: z.string(),
    name: z.string(),
    category: z.string().nullable().optional(),
    dateCreated: z.date(),
  }),
  'GadgetResponseDto',
);

@Injectable()
class TestAuthAdapter implements AuthAdapterInterface {
  async authenticate(request: AuthRequest): Promise<AuthAttemptResult> {
    const token = extractBearerToken(request);
    if (token === null) return { matched: false };
    if (token === 'valid-token') {
      return {
        matched: true,
        user: {
          id: 'user-1',
          sub: 'user-1',
          email: 'test@test.com',
          userRoles: [{ role: { name: 'admin' } }],
          claims: {},
        },
      };
    }
    return { matched: true, error: new UnauthorizedException() };
  }
}

// defineResource() bundle — the full subject under test. Wired through
// RocketsModule with NO explicit entity registration for the gadget
// entity; the bundle must auto-contribute it via buildAppRegistrationPlan.
const gadgetResource = defineResource({
  key: 'gadget',
  entity: GadgetEntity,
  path: 'gadgets',
  tags: ['Gadgets'],
  dto: {
    response: gadgetResponseSchema,
    create: gadgetCreateSchema,
    update: gadgetUpdateSchema,
  },
});

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

describe('RocketsModule — defineResource() bundle (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [GadgetEntity],
          synchronize: true,
          dropSchema: true,
        }),
        RocketsModule.forRoot({
          auth: e2eAuthBootstrap(TestAuthAdapter),
          userMetadata: {
            ...userMetadataConfigFixture,
            // Per-entity override — user-metadata uses the in-memory fake
            // so this suite doesn't need to wire StubUserMetadataEntity into
            // TypeOrmModule.forRoot.
            repository: E2eFakeRepositoryModule,
          },
          repository: TypeOrmRepositoryModule,
          // NOTE: no `repositories` entry for 'gadget' — the bundle
          // below supplies it automatically via buildAppRegistrationPlan.
          resources: [gadgetResource],
        }),
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  let createdId: string;

  it('POST /gadgets — creates at the explicit `path` declared on the resource', async () => {
    const res = await request(app.getHttpServer())
      .post('/gadgets')
      .set('Authorization', 'Bearer valid-token')
      .send({ name: 'Sprocket', category: 'mechanical' })
      .expect(201);

    expect(res.body).toHaveProperty('id');
    expect(res.body.name).toBe('Sprocket');
    createdId = res.body.id;
  });

  it('POST /gadgets — response comes from the response schema (dates ISO, undeclared keys gone)', async () => {
    const res = await request(app.getHttpServer())
      .post('/gadgets')
      .set('Authorization', 'Bearer valid-token')
      .send({ name: 'Cog' })
      .expect(201);

    expect(res.body.dateCreated).toMatch(ISO_DATE);
    expect(res.body).not.toHaveProperty('dateUpdated');
  });

  it('POST /gadgets — 400 from the Rockets exception factory when the body fails the create schema', async () => {
    const res = await request(app.getHttpServer())
      .post('/gadgets')
      .set('Authorization', 'Bearer valid-token')
      .send({ category: 'no-name' })
      .expect(400);

    expect(res.body.statusCode).toBe(400);
    expect(res.body.message).toMatch(/^name: /);
  });

  it('GET /gadgets — lists items (default List operation enabled)', async () => {
    const res = await request(app.getHttpServer())
      .get('/gadgets')
      .set('Authorization', 'Bearer valid-token')
      .expect(200);

    expect(res.body).toHaveProperty('data');
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0]).not.toHaveProperty('dateUpdated');
  });

  it('GET /gadgets/:id — reads single item', async () => {
    const res = await request(app.getHttpServer())
      .get(`/gadgets/${createdId}`)
      .set('Authorization', 'Bearer valid-token')
      .expect(200);

    expect(res.body.id).toBe(createdId);
  });

  it('PATCH /gadgets/:id — updates (Update operation enabled)', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/gadgets/${createdId}`)
      .set('Authorization', 'Bearer valid-token')
      .send({ id: createdId, name: 'Updated Sprocket' })
      .expect(200);

    expect(res.body.name).toBe('Updated Sprocket');
  });

  it('DELETE /gadgets/:id — deletes (Delete operation enabled)', async () => {
    await request(app.getHttpServer())
      .delete(`/gadgets/${createdId}`)
      .set('Authorization', 'Bearer valid-token')
      .expect(204);

    await request(app.getHttpServer())
      .get(`/gadgets/${createdId}`)
      .set('Authorization', 'Bearer valid-token')
      .expect(404);
  });

  it('GET /gadgets — 401 without token (bearerAuth default)', async () => {
    await request(app.getHttpServer()).get('/gadgets').expect(401);
  });

  it('documents the resource responses as named components', () => {
    const document = app
      .get(SwaggerUiService, { strict: false })
      .createDocument(app);

    expect(Object.keys(document.components?.schemas ?? {})).toEqual(
      expect.arrayContaining([
        'GadgetResponseDto',
        'GadgetResponseDtoPaginatedDto',
      ]),
    );
    expect(document.paths['/gadgets']?.get?.responses['200']).toMatchObject({
      content: {
        'application/json': {
          schema: {
            $ref: '#/components/schemas/GadgetResponseDtoPaginatedDto',
          },
        },
      },
    });
    expect(
      document.paths['/gadgets/{id}']?.patch?.responses['200'],
    ).toMatchObject({
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/GadgetResponseDto' },
        },
      },
    });

    // Since nestjs-modules#467 upstream stamps the body as
    // `ApiBody({ standardSchema })`, so it goes through the document
    // converter and is `$ref`'d like every response.
    expect(document.paths['/gadgets']?.post?.requestBody).toMatchObject({
      required: true,
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/GadgetCreateDto' },
        },
      },
    });
    expect(document.components?.schemas).toHaveProperty('GadgetCreateDto');
    expect(document.components?.schemas).toHaveProperty('GadgetUpdateDto');
  });
});
