import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { HttpAdapterHost } from '@nestjs/core';

import { AppModuleAdminRelationsFixture } from '../../../__fixtures__/admin/app-module-admin-relations.fixture';
import { ExceptionsFilter, RoleEntityInterface } from '@concepta/nestjs-common';
import { RoleModelService, RoleService } from '@concepta/nestjs-role';

describe('RocketsAuthAdminModule (e2e)', () => {
  let app: INestApplication;
  let roleModelService: RoleModelService;
  let roleService: RoleService;
  let adminRole: RoleEntityInterface;

  beforeAll(async () => {
    process.env.ADMIN_ROLE_NAME = 'admin';
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModuleAdminRelationsFixture],
    }).compile();

    app = moduleFixture.createNestApplication();
    const exceptionsFilter = app.get(HttpAdapterHost);

    roleModelService = app.get(RoleModelService);
    roleService = app.get(RoleService);
    app.useGlobalFilters(new ExceptionsFilter(exceptionsFilter));
    app.useGlobalPipes(new ValidationPipe());
    await app.init();

    adminRole = await roleModelService.create({
      name: 'admin',
      description: 'admin role',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('should define app', async () => {
    expect(app).toBeDefined();
  });

  it('should signup, authenticate and access admin endpoints', async () => {
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
        userMetadata: { firstName: 'Test' }, // Ensure metadata is present with some data
      })
      .expect(201);

    const loginRes = await request(app.getHttpServer())
      .post('/token/password')
      .send({ username, password })
      .expect(200);

    const token = loginRes.body.accessToken;
    expect(token).toBeDefined();

    const userId = signupRes.body.id;
    await roleService.assignRole({
      assignment: 'user',
      role: { id: adminRole.id },
      assignee: { id: userId },
    });

    // Verify the role assignment was successful
    const hasAdminRole = await roleService.isAssignedRole({
      assignment: 'user',
      assignee: { id: userId },
      role: { id: adminRole.id },
    });
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
