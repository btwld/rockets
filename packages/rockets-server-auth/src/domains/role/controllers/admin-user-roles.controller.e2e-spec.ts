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

describe('AdminUserRolesController (e2e)', () => {
  let app: INestApplication;
  let commandBus: CommandBus;
  let queryBus: QueryBus;
  let adminRole: { id: string };
  let adminToken: string;
  let adminUserId: string;
  let testUserId: string;
  let testRole: { id: string };

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

    const roleCtx = { entity: ROLE_CRUD_ENTITY_KEY, hooks: [] };
    const userRoleCtx = { entity: USER_ROLE_ENTITY_KEY, hooks: [] };

    // Create admin role
    adminRole = await commandBus.execute(
      new CreateRoleCommand(roleCtx, {
        name: 'admin',
        description: 'admin role',
      }),
    );

    // Create admin user
    const adminSignupRes = await request(app.getHttpServer())
      .post('/signup')
      .send({
        username: 'admin',
        email: 'admin@example.com',
        password: 'Admin123!',
        active: true,
        userMetadata: { firstName: 'Admin', lastName: 'User' },
      })
      .expect(201);

    adminUserId = adminSignupRes.body.id;

    // Assign admin role
    await commandBus.execute(
      new AssignRoleCommand(userRoleCtx, adminRole.id, adminUserId),
    );

    // Login as admin
    const loginRes = await request(app.getHttpServer())
      .post('/token/password')
      .send({ username: 'admin', password: 'Admin123!' })
      .expect(200);

    adminToken = loginRes.body.accessToken;

    // Create a test user
    const testSignupRes = await request(app.getHttpServer())
      .post('/signup')
      .send({
        username: 'testuser',
        email: 'testuser@example.com',
        password: 'Test123!',
        active: true,
        userMetadata: { firstName: 'Test', lastName: 'User' },
      })
      .expect(201);

    testUserId = testSignupRes.body.id;

    // Create a test role
    testRole = await commandBus.execute(
      new CreateRoleCommand(roleCtx, {
        name: 'editor',
        description: 'Editor role',
      }),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /admin/users/:userId/roles', () => {
    it('should return empty array when user has no roles', async () => {
      const response = await request(app.getHttpServer())
        .get(`/admin/users/${testUserId}/roles`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toBeDefined();
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(0);
    });

    it('should return 401 when no token provided', async () => {
      await request(app.getHttpServer())
        .get(`/admin/users/${testUserId}/roles`)
        .expect(401);
    });

    it('should return 403 when non-admin user tries to access', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/token/password')
        .send({ username: 'testuser', password: 'Test123!' })
        .expect(200);

      await request(app.getHttpServer())
        .get(`/admin/users/${testUserId}/roles`)
        .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
        .expect(403);
    });
  });

  describe('POST /admin/users/:userId/roles', () => {
    it('should assign role to user successfully', async () => {
      await request(app.getHttpServer())
        .post(`/admin/users/${testUserId}/roles`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ roleId: testRole.id })
        .expect(201);

      // Verify via CQRS query
      const hasRole = await queryBus.execute(
        new IsAssignedRoleQuery(
          { entity: USER_ROLE_ENTITY_KEY, hooks: [] },
          testRole.id,
          testUserId,
        ),
      );
      expect(hasRole).toBe(true);
    });

    it('should return assigned roles after assignment', async () => {
      const response = await request(app.getHttpServer())
        .get(`/admin/users/${testUserId}/roles`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toBeDefined();
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);

      const assignedRole = response.body.find(
        (r: { props: { roleId: string } }) => r.props.roleId === testRole.id,
      );
      expect(assignedRole).toBeDefined();
      expect(assignedRole.props.roleId).toBe(testRole.id);
    });

    it('should return 400 when roleId is missing', async () => {
      await request(app.getHttpServer())
        .post(`/admin/users/${testUserId}/roles`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(400);
    });

    it('should return 400 when roleId is invalid', async () => {
      await request(app.getHttpServer())
        .post(`/admin/users/${testUserId}/roles`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ roleId: 123 })
        .expect(400);
    });

    it('should return 401 when no token provided', async () => {
      await request(app.getHttpServer())
        .post(`/admin/users/${testUserId}/roles`)
        .send({ roleId: testRole.id })
        .expect(401);
    });

    it('should return 403 when non-admin user tries to assign role', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/token/password')
        .send({ username: 'testuser', password: 'Test123!' })
        .expect(200);

      await request(app.getHttpServer())
        .post(`/admin/users/${testUserId}/roles`)
        .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
        .send({ roleId: testRole.id })
        .expect(403);
    });
  });

  describe('Complete flow: Create role and assign to new user', () => {
    it('should create new role, create new user, and assign role successfully', async () => {
      const roleCtx = { entity: ROLE_CRUD_ENTITY_KEY, hooks: [] };
      const userRoleCtx = { entity: USER_ROLE_ENTITY_KEY, hooks: [] };

      // 1. Create a new role
      const newRole: { id: string } = await commandBus.execute(
        new CreateRoleCommand(roleCtx, {
          name: 'moderator',
          description: 'Moderator role',
        }),
      );

      expect(newRole).toBeDefined();
      expect(newRole.id).toBeDefined();

      // 2. Create a new user
      const newUserRes = await request(app.getHttpServer())
        .post('/signup')
        .send({
          username: 'newuser',
          email: 'newuser@example.com',
          password: 'NewUser123!',
          active: true,
          userMetadata: { firstName: 'New', lastName: 'User' },
        })
        .expect(201);

      const newUserId = newUserRes.body.id;

      // 3. Verify user has no roles initially
      const rolesBeforeRes = await request(app.getHttpServer())
        .get(`/admin/users/${newUserId}/roles`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(rolesBeforeRes.body).toEqual([]);

      // 4. Assign the role via HTTP endpoint
      await request(app.getHttpServer())
        .post(`/admin/users/${newUserId}/roles`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ roleId: newRole.id })
        .expect(201);

      // 5. Verify via endpoint
      const rolesAfterRes = await request(app.getHttpServer())
        .get(`/admin/users/${newUserId}/roles`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(rolesAfterRes.body.length).toBe(1);
      expect(rolesAfterRes.body[0].props.roleId).toBe(newRole.id);

      // 6. Verify via CQRS query
      const hasRole = await queryBus.execute(
        new IsAssignedRoleQuery(userRoleCtx, newRole.id, newUserId),
      );
      expect(hasRole).toBe(true);
    });

    it('should assign multiple roles to a single user', async () => {
      const roleCtx = { entity: ROLE_CRUD_ENTITY_KEY, hooks: [] };

      const secondRole: { id: string } = await commandBus.execute(
        new CreateRoleCommand(roleCtx, {
          name: 'viewer',
          description: 'Viewer role',
        }),
      );

      const userRes = await request(app.getHttpServer())
        .post('/signup')
        .send({
          username: 'multiuser',
          email: 'multiuser@example.com',
          password: 'Multi123!',
          active: true,
          userMetadata: { firstName: 'Multi', lastName: 'User' },
        })
        .expect(201);

      const userId = userRes.body.id;

      // Assign first role
      await request(app.getHttpServer())
        .post(`/admin/users/${userId}/roles`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ roleId: testRole.id })
        .expect(201);

      // Assign second role
      await request(app.getHttpServer())
        .post(`/admin/users/${userId}/roles`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ roleId: secondRole.id })
        .expect(201);

      // Verify both roles
      const rolesRes = await request(app.getHttpServer())
        .get(`/admin/users/${userId}/roles`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(rolesRes.body.length).toBe(2);
      const roleIds = rolesRes.body.map(
        (r: { props: { roleId: string } }) => r.props.roleId,
      );
      expect(roleIds).toContain(testRole.id);
      expect(roleIds).toContain(secondRole.id);
    });
  });
});
