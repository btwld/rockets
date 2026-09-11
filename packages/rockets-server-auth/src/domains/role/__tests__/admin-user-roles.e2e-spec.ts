import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import 'reflect-metadata';

import { INestApplication } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AssignRoleCommand, CreateRoleCommand } from '@concepta/nestjs-role';
import { AppContextHost } from '@concepta/rockets-core';

import {
  applyRocketsAuthE2eAppGlobals,
  createRocketsAuthStandardE2eTestingModule,
} from '../../../__e2e__/helpers/rockets-auth-e2e-app.factory';
import {
  ROLE_CRUD_ENTITY_KEY,
  USER_ROLE_ENTITY_KEY,
} from '../../../shared/constants/repository-entity-keys.constants';
import { rocketsAuthRoleSchema } from '../infrastructure/schemas/rockets-auth-role.schema';

describe('Admin user roles (e2e)', () => {
  let app: INestApplication;
  let module: TestingModule;
  let adminToken: string;
  let adminUserId: string;
  let adminRoleId: string;
  let staffRoleId: string;
  let memberUserId: string;
  let memberToken: string;
  const mockEmail = { sendMail: vi.fn().mockResolvedValue(undefined) };

  async function signup(username: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/signup')
      .send({
        username,
        email: `${username}@example.com`,
        password: 'StrongP@ssw0rd',
        active: true,
      })
      .expect(201);
    return res.body.id as string;
  }

  async function login(username: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/token/password')
      .send({ username, password: 'StrongP@ssw0rd' })
      .expect(200);
    return res.body.accessToken as string;
  }

  beforeAll(async () => {
    module = await createRocketsAuthStandardE2eTestingModule({
      mockEmailService: mockEmail,
      // The admin role routes are mounted only when `roleCrud` is configured.
      rocketsAuthOverrides: { roleCrud: { model: rocketsAuthRoleSchema } },
    });
    app = module.createNestApplication();
    applyRocketsAuthE2eAppGlobals(app);
    await app.init();

    const commandBus = app.get(CommandBus);
    const adminRole = await commandBus.execute(
      new CreateRoleCommand(new AppContextHost(), ROLE_CRUD_ENTITY_KEY, {
        name: 'admin',
        description: 'Administrator',
      }),
    );
    adminRoleId = (adminRole as { toPlain: () => { id: string } }).toPlain().id;
    const staffRole = await commandBus.execute(
      new CreateRoleCommand(new AppContextHost(), ROLE_CRUD_ENTITY_KEY, {
        name: 'staff',
        description: 'Staff',
      }),
    );
    staffRoleId = (staffRole as { toPlain: () => { id: string } }).toPlain().id;

    adminUserId = await signup('roles-admin');
    await commandBus.execute(
      new AssignRoleCommand(
        new AppContextHost(),
        USER_ROLE_ENTITY_KEY,
        adminRoleId,
        adminUserId,
      ),
    );
    adminToken = await login('roles-admin');

    memberUserId = await signup('roles-member');
    memberToken = await login('roles-member');
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /admin/users/:userId/roles — serializes each assignment through RocketsAuthUserRoleDto', async () => {
    const res = await request(app.getHttpServer())
      .get(`/admin/users/${adminUserId}/roles`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
    const [assignment] = res.body;
    expect(assignment).toMatchObject({
      roleId: adminRoleId,
      assigneeId: adminUserId,
    });
    expect(typeof assignment.id).toBe('string');
    expect(typeof assignment.dateCreated).toBe('string');
    // Fail-closed: nothing beyond the declared schema keys reaches the wire.
    expect(
      Object.keys(assignment).every((key) =>
        [
          'id',
          'roleId',
          'assigneeId',
          'dateCreated',
          'dateUpdated',
          'dateDeleted',
          'version',
        ].includes(key),
      ),
    ).toBe(true);
  });

  it('POST /admin/users/:userId/roles — assigns and the list reflects it', async () => {
    await request(app.getHttpServer())
      .post(`/admin/users/${memberUserId}/roles`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ roleId: staffRoleId })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/admin/users/${memberUserId}/roles`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.map((a: { roleId: string }) => a.roleId)).toEqual([
      staffRoleId,
    ]);
  });

  // No global pipe is registered: the 400 proves the controller's own
  // Standard Schema pipe rejects the body before the command runs.
  it('POST /admin/users/:userId/roles — validates the body', async () => {
    const res = await request(app.getHttpServer())
      .post(`/admin/users/${memberUserId}/roles`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ roleId: 42 })
      .expect(400);
    expect(res.body.errorCode).toBe('HTTP_BAD_REQUEST');
  });

  it('rejects non-admin callers and anonymous requests', async () => {
    await request(app.getHttpServer())
      .get(`/admin/users/${memberUserId}/roles`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(`/admin/users/${memberUserId}/roles`)
      .expect(401);
  });
});
