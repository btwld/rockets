import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { HttpAdapterHost } from '@nestjs/core';
import { CommandBus } from '@nestjs/cqrs';

import { AppModuleAdminRelationsFixture } from '../../../__fixtures__/admin/app-module-admin-relations.fixture';
import { ExceptionsFilter } from '@concepta/nestjs-common';
import { CreateRoleCommand, AssignRoleCommand } from '@concepta/nestjs-role';
import {
  ROLE_CRUD_ENTITY_KEY,
  USER_ROLE_ENTITY_KEY,
} from '../../../shared/constants/repository-entity-keys.constants';

describe('RocketsAuthAdminModule (Complete e2e)', () => {
  let app: INestApplication;
  let commandBus: CommandBus;
  let adminRole: { id: string };

  beforeAll(async () => {
    process.env.ADMIN_ROLE_NAME = 'admin';
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModuleAdminRelationsFixture],
    }).compile();

    app = moduleFixture.createNestApplication();
    const exceptionsFilter = app.get(HttpAdapterHost);
    commandBus = app.get(CommandBus);
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

  it('should test admin endpoints with existing user data', async () => {
    // Create admin user and assign role first
    const username = `admin-${Date.now()}`;
    const email = `${username}@example.com`;
    const password = 'Password123!';

    const signupRes = await request(app.getHttpServer())
      .post('/signup')
      .send({
        username,
        email,
        password,
        active: true,
        userMetadata: { firstName: 'Test', lastName: 'Admin' },
      })
      .expect(201);

    // Assign admin role
    const ctx = { entity: USER_ROLE_ENTITY_KEY, hooks: [] };
    await commandBus.execute(
      new AssignRoleCommand(ctx, adminRole.id, signupRes.body.id),
    );

    // Login and get token
    const loginRes = await request(app.getHttpServer())
      .post('/token/password')
      .send({ username, password })
      .expect(200);

    const adminToken = loginRes.body.accessToken;

    // Test admin users endpoint - should work even with empty data
    const listRes = await request(app.getHttpServer())
      .get('/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(listRes.body).toBeDefined();
    expect(listRes.body.data).toBeDefined();
    expect(Array.isArray(listRes.body.data)).toBe(true);

    // Test admin users endpoint with relation filtering
    const filterRes = await request(app.getHttpServer())
      .get('/admin/users?filter=userMetadata.firstName||$eq||Test')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(filterRes.body).toBeDefined();
    expect(filterRes.body.data).toBeDefined();
    expect(Array.isArray(filterRes.body.data)).toBe(true);

    // Test admin users endpoint with relation sorting
    const sortRes = await request(app.getHttpServer())
      .get('/admin/users?sort[]=userMetadata.firstName,ASC')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(sortRes.body).toBeDefined();
    expect(sortRes.body.data).toBeDefined();
    expect(Array.isArray(sortRes.body.data)).toBe(true);
  });

  it('should test signup and admin integration', async () => {
    // Create admin user first
    const adminUsername = `admin-${Date.now()}`;
    const adminEmail = `${adminUsername}@example.com`;
    const adminPassword = 'Password123!';

    const adminSignupRes = await request(app.getHttpServer())
      .post('/signup')
      .send({
        username: adminUsername,
        email: adminEmail,
        password: adminPassword,
        active: true,
        userMetadata: { firstName: 'Admin', lastName: 'User' },
      })
      .expect(201);

    // Assign admin role
    const ctx = { entity: USER_ROLE_ENTITY_KEY, hooks: [] };
    await commandBus.execute(
      new AssignRoleCommand(ctx, adminRole.id, adminSignupRes.body.id),
    );

    // Login and get admin token
    const adminLoginRes = await request(app.getHttpServer())
      .post('/token/password')
      .send({ username: adminUsername, password: adminPassword })
      .expect(200);

    const adminToken = adminLoginRes.body.accessToken;

    // Test signup with metadata
    const signupRes = await request(app.getHttpServer())
      .post('/signup')
      .send({
        username: 'testuser',
        email: 'testuser@example.com',
        password: 'Password123!',
        active: true,
        userMetadata: { firstName: 'Test', lastName: 'User' },
      })
      .expect(201);

    expect(signupRes.body).toBeDefined();
    expect(signupRes.body.id).toBeDefined();
    expect(signupRes.body.email).toBe('testuser@example.com');

    // Now test admin endpoint - should be able to see the user
    const listRes = await request(app.getHttpServer())
      .get('/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(listRes.body).toBeDefined();
    expect(listRes.body.data).toBeDefined();
    expect(Array.isArray(listRes.body.data)).toBe(true);
    expect(listRes.body.data.length).toBeGreaterThan(0);

    // Find the user we just created
    const createdUser = listRes.body.data.find(
      (user: { id: string }) => user.id === signupRes.body.id,
    );
    expect(createdUser).toBeDefined();
    expect(createdUser.userMetadata).toBeDefined();
    expect(createdUser.userMetadata.firstName).toBe('Test');
    expect(createdUser.userMetadata.lastName).toBe('User');
  });
});
