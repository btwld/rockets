import {
  INestApplication,
  Injectable,
  UnauthorizedException,
  Global,
  Module,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import { CrudResponsePaginatedDto } from '@bitwild/rockets-crud';
import { getDynamicRepositoryToken } from '@bitwild/rockets-repository';
import { Expose, Type } from 'class-transformer';
import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import request from 'supertest';
import type { AuthProviderInterface } from '../domain/interfaces/auth-provider.interface';
import type { AuthorizedUser } from '../domain/interfaces/auth-user.interface';
import { RocketsCoreModule } from '../rockets-core.module';
import {
  AUTH_PROVIDER_TOKEN,
  USER_METADATA_MODULE_ENTITY_KEY,
} from '../rockets-core.constants';
import { APP_GUARD } from '@nestjs/core';
import { AuthServerGuard } from '../infrastructure/guards/auth-server.guard';
import { defineResource } from '../infrastructure/resource/define-resource';

// ── Fixtures ──

@Injectable()
class SimpleAuthProvider implements AuthProviderInterface {
  async validateToken(token: string): Promise<AuthorizedUser> {
    if (token === 'ok') return { id: 'u1', sub: 'u1' };
    throw new UnauthorizedException();
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
          authProvider: new SimpleAuthProvider(),
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

  it('resolves authProvider via forRootAsync', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        MetaRepoModule,
        RocketsCoreModule.forRootAsync({
          useFactory: () => ({
            authProvider: new SimpleAuthProvider(),
          }),
          global: true,
        }),
      ],
      providers: [{ provide: APP_GUARD, useClass: AuthServerGuard }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    const provider = app.get(AUTH_PROVIDER_TOKEN);
    expect(provider).toBeDefined();
    expect(provider).toHaveProperty('validateToken');
  });
});
