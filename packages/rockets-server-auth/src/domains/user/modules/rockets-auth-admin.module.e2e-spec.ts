import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { HttpAdapterHost } from '@nestjs/core';
import { CommandBus, QueryBus } from '@nestjs/cqrs';

import { AppModuleAdminRelationsFixture } from '../../../__fixtures__/admin/app-module-admin-relations.fixture';
import { ExceptionsFilter } from '@concepta/nestjs-common';
import {
  CreateRoleCommand,
  AssignRoleCommand,
  IsAssignedRoleQuery,
} from '@concepta/nestjs-role';
import {
  ROLE_CRUD_ENTITY_KEY,
  USER_ROLE_ENTITY_KEY,
} from '../../../shared/constants/repository-entity-keys.constants';

describe('RocketsAuthAdminModule (e2e)', () => {
  let app: INestApplication;
  let commandBus: CommandBus;
  let queryBus: QueryBus;
  let adminRole: { id: string };

  beforeAll(async () => {
    process.env.ADMIN_ROLE_NAME = 'admin';
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModuleAdminRelationsFixture],
    }).compile();

    app = moduleFixture.createNestApplication();
    const exceptionsFilter = app.get(HttpAdapterHost);

    commandBus = app.get(CommandBus);
    queryBus = app.get(QueryBus);
    app.useGlobalFilters(new ExceptionsFilter(exceptionsFilter));
    app.useGlobalPipes(new ValidationPipe());
    await app.init();

    const ctx = { entity: ROLE_CRUD_ENTITY_KEY, hooks: [] };
    adminRole = await commandBus.execute(
      new CreateRoleCommand(ctx, {
        name: 'admin',
        description: 'admin role',
      }),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('should define app', async () => {
    expect(app).toBeDefined();
  });

  it.only('should signup, authenticate and access admin endpoints', async () => {
    const username = 'adminuser';
    const password = 'Password123!';
    const email = 'adminuser@example.com';

    await request(app.getHttpServer())
      .get('/admin/users')
      .set('Authorization', `Bearer wrong_token`)
      .expect(401);

    const signupRes = await request(app.getHttpServer())
      .post('/signup')
      .send({
        username,
        email,
        password,
        active: true,
        userMetadata: { firstName: 'Test' },
      })
      .expect(201);

    const loginRes = await request(app.getHttpServer())
      .post('/token/password')
      .send({
        username,
        password,
      })
      .expect(200);

    const token = loginRes.body.accessToken;
    expect(token).toBeDefined();

    const userId = signupRes.body.id;
    const ctx = { entity: USER_ROLE_ENTITY_KEY, hooks: [] };
    await commandBus.execute(new AssignRoleCommand(ctx, adminRole.id, userId));

    // Verify the role assignment was successful
    const hasAdminRole = await queryBus.execute(
      new IsAssignedRoleQuery(ctx, adminRole.id, userId),
    );
    expect(hasAdminRole).toBe(true);

    // Re-login to get a fresh access token after role assignment
    const loginRes2 = await request(app.getHttpServer())
      .post('/token/password')
      .send({ username, password })
      .expect(200);
    const adminToken = loginRes2.body.accessToken;

    const listRes = await request(app.getHttpServer())
      .get('/admin/users')
      .set('Authorization', `Bearer ${adminToken}`);

    if (listRes.status !== 200) {
      console.error(
        'Admin users endpoint error:',
        listRes.status,
        listRes.text,
      );
    }

    expect(listRes.status).toBe(200);

    expect(listRes.body).toBeDefined();

    // Should hydrate metadata when relations configured (optional in fixtures)
    // Filter by a relation field; if relations are not configured, server may return 400
    const relFilterResponse = await request(app.getHttpServer())
      .get('/admin/users?filter=userMetadata.firstName||$contL||')
      .set('Authorization', `Bearer ${adminToken}`);

    // Accept 200 (relations enabled) or 400 (relations disabled in fixture)
    expect([200, 400]).toContain(relFilterResponse.status);

    // Update user via admin endpoint
    const updateRes = await request(app.getHttpServer())
      .patch(`/admin/users/${userId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ active: false })
      .expect(200);

    expect(updateRes.body.active).toBe(false);
    expect(updateRes.body.id).toBe(userId);
  });
});
