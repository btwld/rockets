import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  ExecutionContext,
  INestApplication,
  Injectable,
  UnauthorizedException,
  Global,
  Module,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TypeOrmRepositoryModule } from '@concepta/rockets-repository-typeorm';
import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import { withOpenApi } from '@concepta/nestjs-core';
import { getDynamicRepositoryToken } from '@concepta/nestjs-repository';
import {
  AccessControlCreateOne,
  AccessControlReadMany,
  AccessControlServiceInterface,
} from '@concepta/nestjs-access-control';
import { AccessControl } from 'accesscontrol';
import request from 'supertest';
import { z } from 'zod';
import type {
  AuthAdapterInterface,
  AuthAttemptResult,
  AuthRequest,
} from '../domain/interfaces/auth-adapter.interface';
import type { AuthorizedUser } from '../domain/interfaces/auth-user.interface';
import { extractBearerToken } from '../infrastructure/auth/extract-bearer-token';
import { RocketsCoreModule } from '../rockets-core.module';
import { USER_METADATA_MODULE_ENTITY_KEY } from '../rockets-core.constants';
import { APP_GUARD } from '@nestjs/core';
import { AuthServerGuard } from '../infrastructure/guards/auth-server.guard';
import { defineResource } from '../infrastructure/resource/define-resource';
import { defineAuthAdapter } from '../infrastructure/auth/define-auth-adapter';

// ── Fixtures ──

@Injectable()
class RoleAuthProvider implements AuthAdapterInterface {
  async authenticate(request: AuthRequest): Promise<AuthAttemptResult> {
    const token = extractBearerToken(request);
    if (token === null) return { matched: false };
    if (token === 'admin') {
      return {
        matched: true,
        user: {
          id: 'admin-1',
          sub: 'admin-1',
          userRoles: [{ role: { name: 'admin' } }],
        },
      };
    }
    if (token === 'user') {
      return {
        matched: true,
        user: {
          id: 'user-1',
          sub: 'user-1',
          userRoles: [{ role: { name: 'user' } }],
        },
      };
    }
    return { matched: true, error: new UnauthorizedException() };
  }
}

class AcService implements AccessControlServiceInterface {
  async getUser(context: ExecutionContext): Promise<unknown> {
    return context.switchToHttp().getRequest().user;
  }
  async getUserRoles(context: ExecutionContext): Promise<string | string[]> {
    const user = context.switchToHttp().getRequest().user as
      | Pick<AuthorizedUser, 'userRoles'>
      | undefined;
    return user?.userRoles?.map((userRole) => userRole.role.name) ?? [];
  }
}

const acRules = new AccessControl();
acRules.grant('admin').resource('gizmo').createAny().readAny();
acRules.grant('user').resource('gizmo').readAny();

@Entity('gizmos')
class GizmoEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar' }) label!: string;
}

const gizmoCreateSchema = withOpenApi(
  z.object({ label: z.string() }),
  'GizmoCreateDto',
);

const gizmoResponseSchema = withOpenApi(
  z.object({ id: z.uuid(), label: z.string() }),
  'GizmoResponseDto',
);

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

describe('RocketsCoreModule — opt-in accessControl (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [GizmoEntity],
          synchronize: true,
          dropSchema: true,
        }),
        MetaRepoModule,
        RocketsCoreModule.forRoot({
          auth: defineAuthAdapter(RoleAuthProvider),
          providers: [RoleAuthProvider],
          repository: TypeOrmRepositoryModule,
          resources: [
            defineResource({
              key: 'gizmo',
              entity: GizmoEntity,
              path: 'gizmos',
              tags: ['Gizmos'],
              dto: {
                response: gizmoResponseSchema,
                create: gizmoCreateSchema,
              },
              operations: {
                list: {
                  decorators: [AccessControlReadMany('gizmo')],
                },
                create: {
                  decorators: [AccessControlCreateOne('gizmo')],
                },
              },
            }),
          ],
          accessControl: {
            service: new AcService(),
            settings: { rules: acRules },
            appFilter: false,
          },
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

  it('admin (granted create) can POST /gizmos', async () => {
    const res = await request(app.getHttpServer())
      .post('/gizmos')
      .set('Authorization', 'Bearer admin')
      .send({ label: 'ac-gizmo' })
      .expect(201);

    expect(res.body.label).toBe('ac-gizmo');
  });

  it('user (read-only grant) gets 403 on POST /gizmos', async () => {
    await request(app.getHttpServer())
      .post('/gizmos')
      .set('Authorization', 'Bearer user')
      .send({ label: 'nope' })
      .expect(403);
  });

  it('user (read grant) can GET /gizmos', async () => {
    const res = await request(app.getHttpServer())
      .get('/gizmos')
      .set('Authorization', 'Bearer user')
      .expect(200);

    expect(res.body).toHaveProperty('data');
  });

  it('unauthenticated request is rejected before ACL evaluation', async () => {
    await request(app.getHttpServer()).get('/gizmos').expect(401);
  });
});
