import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { HttpAdapterHost } from '@nestjs/core';
import { CommandBus } from '@nestjs/cqrs';
import { AppModuleAdminFixture } from '../../../__fixtures__/admin/app-module-admin.fixture';
import { ExceptionsFilter } from '@concepta/nestjs-common';
import { CreateRoleCommand, AssignRoleCommand } from '@concepta/nestjs-role';
import {
  ROLE_CRUD_ENTITY_KEY,
  USER_ROLE_ENTITY_KEY,
} from '../../../shared/constants/repository-entity-keys.constants';

describe('Roles Admin (e2e)', () => {
  let app: INestApplication;
  let commandBus: CommandBus;
  let adminRole: { id: string };

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModuleAdminFixture],
    }).compile();

    app = moduleFixture.createNestApplication();
    const exceptionsFilter = app.get(HttpAdapterHost);
    commandBus = app.get(CommandBus);
    app.useGlobalFilters(new ExceptionsFilter(exceptionsFilter));
    app.useGlobalPipes(new ValidationPipe());
    await app.init();

    adminRole = await commandBus.execute(
      new CreateRoleCommand(
        { entity: ROLE_CRUD_ENTITY_KEY, hooks: [] },
        { name: 'admin', description: 'admin role' },
      ),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('should CRUD roles and manage user-role assignments (with admin auth)', async () => {
    // Create a user via signup
    const username = `user-${Date.now()}`;
    const signup = await request(app.getHttpServer())
      .post('/signup')
      .send({
        username,
        email: `${username}@example.com`,
        password: 'Password123!',
        active: true,
      })
      .expect(201);

    // Login to get token
    const loginRes = await request(app.getHttpServer())
      .post('/token/password')
      .send({ username, password: 'Password123!' })
      .expect(200);
    const token = loginRes.body.accessToken;

    const userId = signup.body.id;

    // Grant admin role to the user
    await commandBus.execute(
      new AssignRoleCommand(
        { entity: USER_ROLE_ENTITY_KEY, hooks: [] },
        adminRole.id,
        userId,
      ),
    );

    // Create a role for CRUD flow (authorized)
    const created = await request(app.getHttpServer())
      .post('/admin/roles')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'manager', description: 'manager role' })
      .expect(201);
    const roleId = created.body.id;

    // List roles
    const listRes = await request(app.getHttpServer())
      .get('/admin/roles')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(Array.isArray(listRes.body?.data ?? listRes.body)).toBe(true);

    // Update role
    const updated = await request(app.getHttpServer())
      .patch(`/admin/roles/${roleId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ description: 'updated desc' })
      .expect(200);
    expect(updated.body.description).toBe('updated desc');

    // Delete CRUD role
    await request(app.getHttpServer())
      .delete(`/admin/roles/${roleId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    // Create another role for assignment
    const createdAssignRole = await request(app.getHttpServer())
      .post('/admin/roles')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'member', description: 'member role' })
      .expect(201);
    const assignRoleId = createdAssignRole.body.id;

    // Assign role to user via admin endpoint
    await request(app.getHttpServer())
      .post(`/admin/users/${userId}/roles`)
      .set('Authorization', `Bearer ${token}`)
      .send({ roleId: assignRoleId })
      .expect(201);

    // List user roles
    const userRoles = await request(app.getHttpServer())
      .get(`/admin/users/${userId}/roles`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(
      userRoles.body.find(
        (r: { props?: { roleId: string }; roleId?: string }) =>
          (r.props?.roleId ?? r.roleId) === assignRoleId,
      ),
    ).toBeTruthy();
  });
});
