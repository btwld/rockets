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
import { TypeOrmRepositoryModule } from '@bitwild/rockets-repository-typeorm';
import {
  CrudOperationResolver,
  CrudListQuery,
  CrudReadQuery,
  CrudCreateCommand,
  CrudUpdateCommand,
  CrudDeleteCommand,
  CrudResponsePaginatedDto,
  Operation,
} from '@concepta/nestjs-crud';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';
import request from 'supertest';
import { RepositoryModule } from '@bitwild/rockets-core';
import type {
  AuthAdapterInterface,
  AuthAttemptResult,
  AuthRequest,
  UserMetadataCreatableInterface,
  UserMetadataModelUpdatableInterface,
} from '@bitwild/rockets-core';
import { extractBearerToken } from '@bitwild/rockets-core';
import { RocketsModule } from '../rockets.module';
import { StubUserMetadataEntity } from '../__fixtures__/entities/stub-user-metadata.entity';
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
// Test DTOs
// ────────────────────────────────────────────────────────────────────

@Exclude()
class ItemCreateDto {
  @Expose()
  @IsString()
  @ApiProperty()
  name!: string;

  @Expose()
  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  category?: string;
}

@Exclude()
class ItemUpdateDto {
  @Expose()
  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  name?: string;

  @Expose()
  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  category?: string;
}

class ItemResponseDto {
  @Expose() @ApiProperty() id!: string;
  @Expose() @ApiProperty() name!: string;
  @Expose() @ApiPropertyOptional() category?: string;
}

class ItemPaginatedDto extends CrudResponsePaginatedDto<ItemResponseDto> {
  @Expose()
  @Type(() => ItemResponseDto)
  @ApiProperty({ type: [ItemResponseDto], isArray: true })
  declare data: ItemResponseDto[];
}

// ────────────────────────────────────────────────────────────────────
// Auth + UserMetadata fixtures (reused from other tests)
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

class TestMetadataCreateDto implements UserMetadataCreatableInterface {
  @IsString() userId!: string;
}

class TestMetadataUpdateDto implements UserMetadataModelUpdatableInterface {
  @IsString() id!: string;
}

// ────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────

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
          userMetadata: {
            entity: StubUserMetadataEntity,
            createDto: TestMetadataCreateDto,
            updateDto: TestMetadataUpdateDto,
          },
          repository: E2eFakeRepositoryModule,
          resources: [
            {
              crud: {
                controller: {
                  path: 'items',
                  entity: 'item',
                  resolver: CrudOperationResolver,
                  response: {
                    resource: ItemResponseDto,
                    paginated: ItemPaginatedDto,
                  },
                },
                operations: [
                  { operation: Operation.List, query: CrudListQuery },
                  { operation: Operation.Read, query: CrudReadQuery },
                  {
                    operation: Operation.Create,
                    request: { body: ItemCreateDto },
                    command: CrudCreateCommand,
                  },
                  {
                    operation: Operation.Update,
                    request: { body: ItemUpdateDto },
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

  it('GET /items — lists items', async () => {
    const res = await request(app.getHttpServer())
      .get('/items')
      .set('Authorization', 'Bearer valid-token')
      .expect(200);

    expect(res.body).toHaveProperty('data');
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0].name).toBe('Test Item');
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
