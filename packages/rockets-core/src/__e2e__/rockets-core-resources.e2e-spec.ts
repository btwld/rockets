import {
  INestApplication,
  Injectable,
  UnauthorizedException,
  Global,
  Module,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TypeOrmRepositoryModule } from '@bitwild/rockets-repository-typeorm';
import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import { CrudResponsePaginatedDto } from '@bitwild/rockets-crud';
import { getDynamicRepositoryToken } from '@bitwild/rockets-repository';
import { Expose, Type } from 'class-transformer';
import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import request from 'supertest';
import type {
  AuthAdapterInterface,
  AuthAttemptResult,
  AuthRequest,
} from '../domain/interfaces/auth-adapter.interface';
import { extractBearerToken } from '../infrastructure/auth/extract-bearer-token';
import { RocketsCoreModule } from '../rockets-core.module';
import {
  AUTH_ADAPTERS_TOKEN,
  USER_METADATA_MODULE_ENTITY_KEY,
} from '../rockets-core.constants';
import { APP_GUARD } from '@nestjs/core';
import { AuthServerGuard } from '../infrastructure/guards/auth-server.guard';
import { defineResource } from '../infrastructure/resource/define-resource';
import { createStubAuthBootstrap } from '../infrastructure/auth/create-stub-auth-bootstrap';

// ── Fixtures ──

@Injectable()
class SimpleAuthProvider implements AuthAdapterInterface {
  async authenticate(request: AuthRequest): Promise<AuthAttemptResult> {
    const token = extractBearerToken(request);
    if (token === null) return { matched: false };
    if (token === 'ok') return { matched: true, user: { id: 'u1', sub: 'u1' } };
    return { matched: true, error: new UnauthorizedException() };
  }
}

@Entity('widgets')
class WidgetEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar' }) label!: string;
}

class WidgetCreateDto {
  @Expose()
  @IsString()
  @ApiProperty()
  label!: string;
}

class WidgetResponseDto {
  @Expose() @ApiProperty() id!: string;
  @Expose() @ApiProperty() label!: string;
}

class WidgetPaginatedDto extends CrudResponsePaginatedDto<WidgetResponseDto> {
  @Expose()
  @Type(() => WidgetResponseDto)
  @ApiProperty({ type: [WidgetResponseDto], isArray: true })
  declare data: WidgetResponseDto[];
}

class InMemoryMetadataRepo {
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
  providers: [{ provide: metaToken, useValue: new InMemoryMetadataRepo() }],
  exports: [metaToken],
})
class MetaRepoModule {}

// ── Tests ──

describe('RocketsCoreModule — resources + resourcePersistence (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [WidgetEntity],
          synchronize: true,
          dropSchema: true,
        }),
        MetaRepoModule,
        RocketsCoreModule.forRoot({
          auth: createStubAuthBootstrap(SimpleAuthProvider),
          providers: [SimpleAuthProvider],
          repository: TypeOrmRepositoryModule,
          resources: [
            defineResource({
              key: 'widget',
              entity: WidgetEntity,
              path: 'widgets',
              tags: ['Widgets'],
              dto: {
                response: WidgetResponseDto,
                create: WidgetCreateDto,
                paginated: WidgetPaginatedDto,
              },
              providers: [SimpleAuthProvider],
            }),
          ],
          global: true,
        }),
      ],
      providers: [{ provide: APP_GUARD, useClass: AuthServerGuard }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /widgets creates a widget via resource config', async () => {
    const res = await request(app.getHttpServer())
      .post('/widgets')
      .set('Authorization', 'Bearer ok')
      .send({ label: 'my-widget' })
      .expect(201);

    expect(res.body.label).toBe('my-widget');
  });

  it('GET /widgets lists widgets', async () => {
    const res = await request(app.getHttpServer())
      .get('/widgets')
      .set('Authorization', 'Bearer ok')
      .expect(200);

    expect(res.body).toHaveProperty('data');
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('resource providers are exported (SimpleAuthProvider)', () => {
    const provider = app.get(SimpleAuthProvider);
    expect(provider).toBeDefined();
  });
});

describe('RocketsCoreModule.forRootAsync (e2e)', () => {
  let app: INestApplication;

  afterAll(async () => {
    if (app) await app.close();
  });

  it('resolves AUTH_ADAPTERS_TOKEN via forRootAsync extras', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        MetaRepoModule,
        RocketsCoreModule.forRootAsync({
          useFactory: () => ({}),
          // `auth` + `providers` are sync extras (alongside useFactory).
          auth: createStubAuthBootstrap(SimpleAuthProvider),
          providers: [SimpleAuthProvider],
          global: true,
        }),
      ],
      providers: [{ provide: APP_GUARD, useClass: AuthServerGuard }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    const adapters = app.get<AuthAdapterInterface[]>(AUTH_ADAPTERS_TOKEN);
    expect(adapters).toBeDefined();
    expect(Array.isArray(adapters)).toBe(true);
    expect(adapters[0]).toHaveProperty('authenticate');
  });
});
