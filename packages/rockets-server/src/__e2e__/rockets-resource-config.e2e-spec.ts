import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TypeOrmRepositoryModule } from '@concepta/rockets-repository-typeorm';
import {
  CrudOperationResolver,
  CrudListQuery,
  CrudReadQuery,
  CrudCreateCommand,
  CrudUpdateCommand,
  CrudDeleteCommand,
  Operation,
} from '@concepta/nestjs-crud';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import request from 'supertest';
import { z } from 'zod';
import {
  RepositoryModule,
  buildPaginatedSchema,
  rocketsSchemaValidation,
  withOpenApi,
} from '@concepta/rockets-core';
import type {
  AuthAdapterInterface,
  AuthAttemptResult,
  AuthRequest,
} from '@concepta/rockets-core';
import { extractBearerToken } from '@concepta/rockets-core';
import { RocketsModule } from '../rockets.module';
import { userMetadataConfigFixture } from '../__fixtures__/schemas/user-metadata.schema.fixture';
import { E2eFakeRepositoryModule } from './helpers/e2e-fake-repository.module';
import { e2eAuthBootstrap } from '../__fixtures__/providers/e2e-auth-bootstrap.fixture';

// ────────────────────────────────────────────────────────────────────
// Test Entity
// ────────────────────────────────────────────────────────────────────

@Entity('items')
class ItemEntity {
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

// ────────────────────────────────────────────────────────────────────
// Test schemas — `dateUpdated` is deliberately NOT declared on the
// response so the suite can prove undeclared columns never reach the wire.
// ────────────────────────────────────────────────────────────────────

const itemCreateSchema = withOpenApi(
  z.object({ name: z.string(), category: z.string().optional() }),
  'ItemCreateDto',
);

const itemUpdateSchema = withOpenApi(
  z.object({ name: z.string().optional(), category: z.string().optional() }),
  'ItemUpdateDto',
);

const itemResponseSchema = withOpenApi(
  z.object({
    id: z.string(),
    name: z.string(),
    category: z.string().nullable().optional(),
    dateCreated: z.date(),
  }),
  'ItemResponseDto',
);

const itemPaginatedSchema = buildPaginatedSchema(
  itemResponseSchema,
  'rockets-resource-config e2e',
);

// ────────────────────────────────────────────────────────────────────
// Auth fixture (reused from other tests)
// ────────────────────────────────────────────────────────────────────

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

// ────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

describe('RocketsModule — Resource Config (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [ItemEntity],
          synchronize: true,
          dropSchema: true,
        }),
        // Item entity repo registered via RepositoryModule directly —
        // this test validates a manual `RocketsResourceConfig` (no `defineResource()`).
        RepositoryModule.forFeature({
          module: TypeOrmRepositoryModule,
          entities: [{ key: 'item', entity: ItemEntity }],
        }),
        RocketsModule.forRoot({
          auth: e2eAuthBootstrap(TestAuthAdapter),
          userMetadata: userMetadataConfigFixture,
          repository: E2eFakeRepositoryModule,
          resources: [
            {
              crud: {
                controller: {
                  path: 'items',
                  entity: 'item',
                  resolver: CrudOperationResolver,
                  // Hand-built configs do not go through `defineResource`,
                  // so the Rockets exception factory must be wired here.
                  request: { validation: rocketsSchemaValidation },
                  response: {
                    resource: itemResponseSchema,
                    paginated: itemPaginatedSchema,
                  },
                },
                operations: [
                  { operation: Operation.List, query: CrudListQuery },
                  { operation: Operation.Read, query: CrudReadQuery },
                  {
                    operation: Operation.Create,
                    request: { body: itemCreateSchema },
                    command: CrudCreateCommand,
                  },
                  {
                    operation: Operation.Update,
                    request: { body: itemUpdateSchema },
                    command: CrudUpdateCommand,
                  },
                  { operation: Operation.Delete, command: CrudDeleteCommand },
                ],
              },
            },
          ],
        }),
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  let createdItemId: string;

  it('POST /items — creates an item', async () => {
    const res = await request(app.getHttpServer())
      .post('/items')
      .set('Authorization', 'Bearer valid-token')
      .send({ name: 'Test Item', category: 'electronics' })
      .expect(201);

    expect(res.body).toHaveProperty('id');
    expect(res.body.name).toBe('Test Item');
    expect(res.body.category).toBe('electronics');
    createdItemId = res.body.id;
  });

  it('POST /items — response is serialized by the response schema', async () => {
    const res = await request(app.getHttpServer())
      .post('/items')
      .set('Authorization', 'Bearer valid-token')
      .send({ name: 'Serialized Item' })
      .expect(201);

    expect(res.body.dateCreated).toMatch(ISO_DATE);
    expect(res.body).not.toHaveProperty('dateUpdated');
  });

  it('POST /items — 400 when the body fails the create schema', async () => {
    const res = await request(app.getHttpServer())
      .post('/items')
      .set('Authorization', 'Bearer valid-token')
      .send({ name: 42 })
      .expect(400);

    expect(res.body.statusCode).toBe(400);
    expect(res.body.message).toMatch(/^name: /);
  });

  it('GET /items — lists items', async () => {
    const res = await request(app.getHttpServer())
      .get('/items')
      .set('Authorization', 'Bearer valid-token')
      .expect(200);

    expect(res.body).toHaveProperty('data');
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0].name).toBe('Test Item');
    expect(res.body.data[0]).not.toHaveProperty('dateUpdated');
  });

  it('GET /items/:id — reads single item', async () => {
    const res = await request(app.getHttpServer())
      .get(`/items/${createdItemId}`)
      .set('Authorization', 'Bearer valid-token')
      .expect(200);

    expect(res.body.id).toBe(createdItemId);
    expect(res.body.name).toBe('Test Item');
  });

  it('PATCH /items/:id — updates an item', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/items/${createdItemId}`)
      .set('Authorization', 'Bearer valid-token')
      .send({ id: createdItemId, name: 'Updated Item' })
      .expect(200);

    expect(res.body.name).toBe('Updated Item');
    expect(res.body.category).toBe('electronics');
  });

  it('DELETE /items/:id — deletes an item', async () => {
    await request(app.getHttpServer())
      .delete(`/items/${createdItemId}`)
      .set('Authorization', 'Bearer valid-token')
      .expect(204);

    // Verify deleted
    await request(app.getHttpServer())
      .get(`/items/${createdItemId}`)
      .set('Authorization', 'Bearer valid-token')
      .expect(404);
  });

  it('GET /items — 401 without token', async () => {
    await request(app.getHttpServer()).get('/items').expect(401);
  });
});
