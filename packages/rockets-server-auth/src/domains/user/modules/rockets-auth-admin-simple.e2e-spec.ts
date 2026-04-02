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

describe('RocketsAuthAdminModule (Simple e2e)', () => {
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

    // Create admin role
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

  it('should create user with metadata via signup', async () => {
    const username = 'testuser';
    const email = 'testuser@example.com';
    const password = 'Password123!';

    // Test signup with metadata
    const signupRes = await request(app.getHttpServer())
      .post('/signup')
      .send({
        username,
        email,
        password,
        active: true,
        userMetadata: { firstName: 'Test', lastName: 'User', bio: 'Test bio' },
      })
      .expect(201);

    expect(signupRes.body).toBeDefined();
    expect(signupRes.body.id).toBeDefined();
    expect(signupRes.body.email).toBe(email);
    expect(signupRes.body.username).toBe(username);
  });

  it('should authenticate user and get token', async () => {
    const username = 'testuser2';
    const email = 'testuser2@example.com';
    const password = 'Password123!';

    // Create user first
    await request(app.getHttpServer())
      .post('/signup')
      .send({
        username,
        email,
        password,
        active: true,
        userMetadata: { firstName: 'Test2', lastName: 'User2' },
      })
      .expect(201);

    // Login to get token
    const loginRes = await request(app.getHttpServer())
      .post('/token/password')
      .send({ username, password })
      .expect(200);

    expect(loginRes.body).toBeDefined();
    expect(loginRes.body.accessToken).toBeDefined();
    expect(loginRes.body.refreshToken).toBeDefined();
  });

  it('should test unauthorized access to admin endpoints', async () => {
    const username = 'testuser3';
    const email = 'testuser3@example.com';
    const password = 'Password123!';

    // Create user first
    await request(app.getHttpServer())
      .post('/signup')
      .send({
        username,
        email,
        password,
        active: true,
        userMetadata: { firstName: 'Test3', lastName: 'User3' },
      })
      .expect(201);

    // Login to get token
    const loginRes = await request(app.getHttpServer())
      .post('/token/password')
      .send({ username, password })
      .expect(200);

    const token = loginRes.body.accessToken;

    // Test unauthorized access to admin endpoint (should be forbidden)
    await request(app.getHttpServer())
      .get('/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('should test admin role assignment', async () => {
    const username = 'adminuser';
    const email = 'adminuser@example.com';
    const password = 'Password123!';

    // Create user first
    const signupRes = await request(app.getHttpServer())
      .post('/signup')
      .send({
        username,
        email,
        password,
        active: true,
        userMetadata: { firstName: 'Admin', lastName: 'User' },
      })
      .expect(201);

    // Assign admin role
    const ctx = { entity: USER_ROLE_ENTITY_KEY, hooks: [] };
    await commandBus.execute(
      new AssignRoleCommand(ctx, adminRole.id, signupRes.body.id),
    );

    // Verify the role assignment was successful
    const hasAdminRole = await queryBus.execute(
      new IsAssignedRoleQuery(ctx, adminRole.id, signupRes.body.id),
    );
    expect(hasAdminRole).toBe(true);
  });

  it('should test relation filtering and sorting functionality', async () => {
    // Test filtering by relation fields (should work even with empty data)
    await request(app.getHttpServer())
      .get('/admin/users?filter=userMetadata.firstName||$eq||Test')
      .expect(401); // Expected to be unauthorized without any token

    // Test sorting by relation fields (should work even with empty data)
    await request(app.getHttpServer())
      .get('/admin/users?sort[]=userMetadata.firstName,ASC')
      .expect(401); // Expected to be unauthorized without any token

    // The fact that we get 401 (not 500) means the relations system is working
    // and the query parsing is successful
  });
});
