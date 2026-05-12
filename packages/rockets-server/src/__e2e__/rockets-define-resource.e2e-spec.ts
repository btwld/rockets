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
import { IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';
import request from 'supertest';
import type {
  AuthAdapterInterface,
  AuthorizedUser,
  UserMetadataCreatableInterface,
  UserMetadataModelUpdatableInterface,
} from '@bitwild/rockets-core';
import { RocketsModule } from '../rockets.module';
import { StubUserMetadataEntity } from '../__fixtures__/entities/stub-user-metadata.entity';
import { defineResource } from '@bitwild/rockets-core';
import { TypeOrmRepositoryModule } from '@concepta/nestjs-repository-typeorm';
import { E2eFakeRepositoryModule } from './helpers/e2e-fake-repository.module';

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

@Exclude()
class GadgetCreateDto {
  @Expose() @IsString() @ApiProperty() name!: string;
  @Expose() @IsOptional() @IsString() @ApiPropertyOptional() category?: string;
}

@Exclude()
class GadgetUpdateDto {
  @Expose() @IsOptional() @IsString() @ApiPropertyOptional() name?: string;
  @Expose() @IsOptional() @IsString() @ApiPropertyOptional() category?: string;
}

class GadgetResponseDto {
  @Expose() @ApiProperty() id!: string;
  @Expose() @ApiProperty() name!: string;
  @Expose() @ApiPropertyOptional() category?: string;
}

@Injectable()
class TestAuthAdapter implements AuthAdapterInterface {
  async validateToken(token: string): Promise<AuthorizedUser> {
    if (token === 'valid-token') {
      return {
        id: 'user-1',
        sub: 'user-1',
        email: 'test@test.com',
        userRoles: [{ role: { name: 'admin' } }],
        claims: {},
      };
    }
    throw new UnauthorizedException();
  }
}

class TestMetadataCreateDto implements UserMetadataCreatableInterface {
  @IsString() userId!: string;
}

class TestMetadataUpdateDto implements UserMetadataModelUpdatableInterface {
  @IsString() id!: string;
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
    response: GadgetResponseDto,
    create: GadgetCreateDto,
    update: GadgetUpdateDto,
  },
});

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
          auth: TestAuthAdapter,
          userMetadata: {
            entity: StubUserMetadataEntity,
            createDto: TestMetadataCreateDto,
            updateDto: TestMetadataUpdateDto,
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

  it('GET /gadgets — lists items (default List operation enabled)', async () => {
    const res = await request(app.getHttpServer())
      .get('/gadgets')
      .set('Authorization', 'Bearer valid-token')
      .expect(200);

    expect(res.body).toHaveProperty('data');
    expect(res.body.data.length).toBeGreaterThan(0);
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
});
