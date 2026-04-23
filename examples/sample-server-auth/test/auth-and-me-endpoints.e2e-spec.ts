import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { CommandBus } from '@nestjs/cqrs';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { ExceptionsFilter } from '@bitwild/rockets';
import { CreateRoleCommand, AssignRoleCommand } from '@concepta/nestjs-role';
import { USER_ROLE_ENTITY_KEY } from '@bitwild/rockets-auth';
import { AppModule } from '../src/app.module';

/**
 * Auth & Me Endpoints — full integration test.
 *
 * Uses NestFactory.create (same as production) so that all module wiring,
 * AppContextHost, and CQRS handlers resolve correctly.
 */
describe('Auth & Me Endpoints (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, {
      logger: ['error', 'warn'],
    });

    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );

    const httpAdapterHost = app.get(HttpAdapterHost);
    app.useGlobalFilters(new ExceptionsFilter(httpAdapterHost));

    await app.init();

    // Seed required roles via CQRS (same pattern as role-based-access test)
    const commandBus = app.get(CommandBus);
    await commandBus.execute(
      new CreateRoleCommand(null, ROLE_CRUD_ENTITY_KEY, {
        name: 'admin',
        description: 'Administrator',
      }),
    );
    await commandBus.execute(
      new CreateRoleCommand(null, ROLE_CRUD_ENTITY_KEY, {
        name: 'user',
        description: 'Default user role',
      }),
    );
  }, 30000);

  afterAll(async () => {
    if (app) await app.close();
  });

  describe('Signup + Login Flow', () => {
    let accessToken: string;
    let refreshToken: string;

    it('POST /signup — creates new user', async () => {
      const res = await request(app.getHttpServer())
        .post('/signup')
        .send({
          username: 'testuser@test.com',
          email: 'testuser@test.com',
          password: 'Test@Pass123',
          active: true,
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.email).toBe('testuser@test.com');
    });

    it('POST /signup — rejects duplicate email', async () => {
      await request(app.getHttpServer())
        .post('/signup')
        .send({
          username: 'testuser@test.com',
          email: 'testuser@test.com',
          password: 'Test@Pass123',
          active: true,
        })
        .expect(400);
    });

    it('POST /token/password — login with correct credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/token/password')
        .send({
          username: 'testuser@test.com',
          password: 'Test@Pass123',
        })
        .expect(200);

      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
      accessToken = res.body.accessToken;
      refreshToken = res.body.refreshToken;
    });

    it('POST /token/password — rejects wrong password', async () => {
      await request(app.getHttpServer())
        .post('/token/password')
        .send({
          username: 'testuser@test.com',
          password: 'WrongPassword123',
        })
        .expect(401);
    });

    it('POST /token/refresh — refreshes access token', async () => {
      const res = await request(app.getHttpServer())
        .post('/token/refresh')
        .set('Authorization', `Bearer ${refreshToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('accessToken');
      accessToken = res.body.accessToken;
    });

    it('GET /me — returns authenticated user data', async () => {
      const res = await request(app.getHttpServer())
        .get('/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('sub');
      expect(res.body.email).toBe('testuser@test.com');
      expect(res.body).toHaveProperty('userMetadata');
    });

    it('GET /me — 401 without token', async () => {
      await request(app.getHttpServer()).get('/me').expect(401);
    });

    it('GET /me — 401 with invalid token', async () => {
      await request(app.getHttpServer())
        .get('/me')
        .set('Authorization', 'Bearer invalid-jwt-token')
        .expect(401);
    });

    it('PATCH /me — updates user metadata', async () => {
      const res = await request(app.getHttpServer())
        .patch('/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          userMetadata: {
            firstName: 'Test',
            lastName: 'User',
            bio: 'E2e test user',
          },
        })
        .expect(200);

      expect(res.body.userMetadata).toMatchObject({
        firstName: 'Test',
        lastName: 'User',
        bio: 'E2e test user',
      });
    });

    it('PATCH /me — partial metadata update preserves existing fields', async () => {
      const res = await request(app.getHttpServer())
        .patch('/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          userMetadata: {
            bio: 'Updated bio',
          },
        })
        .expect(200);

      expect(res.body.userMetadata.bio).toBe('Updated bio');
      expect(res.body.userMetadata.firstName).toBe('Test');
    });

    it('GET /me — reflects updated metadata', async () => {
      const res = await request(app.getHttpServer())
        .get('/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.userMetadata).toMatchObject({
        firstName: 'Test',
        lastName: 'User',
        bio: 'Updated bio',
      });
    });
  });

  describe('Admin Endpoints', () => {
    let adminToken: string;

    beforeAll(async () => {
      const commandBus = app.get(CommandBus);

      // Create user via signup
      const signupRes = await request(app.getHttpServer())
        .post('/signup')
        .send({
          username: 'admin-test@admin.com',
          email: 'admin-test@admin.com',
          password: 'Admin@Pass123',
          active: true,
        });

      const adminUserId = signupRes.body.id;

      // Get admin role ID from DB
      const { DataSource } = await import('typeorm');
      const dataSource = app.get(DataSource);
      const { RoleEntity } = await import('../src/modules/role/role.entity');
      const roleRepo = dataSource.getRepository(RoleEntity);
      const adminRole = await roleRepo.findOne({ where: { name: 'admin' } });

      if (adminRole) {
        // Assign admin role
        await commandBus.execute(
          new AssignRoleCommand(
            null,
            USER_ROLE_ENTITY_KEY,
            adminRole.id,
            adminUserId,
          ),
        );
      }

      // Login
      const loginRes = await request(app.getHttpServer())
        .post('/token/password')
        .send({
          username: 'admin-test@admin.com',
          password: 'Admin@Pass123',
        });

      adminToken = loginRes.body.accessToken;
    });

    it('GET /admin/users — lists users (requires admin role)', async () => {
      const res = await request(app.getHttpServer())
        .get('/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    });

    it('GET /admin/roles — lists roles (requires admin role)', async () => {
      const res = await request(app.getHttpServer())
        .get('/admin/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('data');
      const roleNames = res.body.data.map((r: { name: string }) => r.name);
      expect(roleNames).toContain('admin');
      expect(roleNames).toContain('user');
    });

    it('GET /admin/users — 401 without token', async () => {
      await request(app.getHttpServer()).get('/admin/users').expect(401);
    });
  });
});
