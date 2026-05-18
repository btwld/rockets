import {
  INestApplication,
  ValidationPipe,
  ExceptionFilter,
  Catch,
  ArgumentsHost,
} from '@nestjs/common';
import request from 'supertest';
import { CommandBus } from '@nestjs/cqrs';
import { AppModule } from '../src/app.module';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { ExceptionsFilter } from '@bitwild/rockets';
import { CreateRoleCommand, AssignRoleCommand } from '@concepta/nestjs-role';
import {
  ROLE_CRUD_ENTITY_KEY,
  USER_ROLE_ENTITY_KEY,
} from '@bitwild/rockets-auth';
import { acRules } from '../src/app.acl';

// `AppContextHost.from()` only accepts `AppContextHost | null | undefined | {}`.
// `createRepositoryContext({entity: ...})` returns a non-empty plain object,
// which the upstream context validator rejects with "Expected AppContextHost
// or nullish value, got object". Use `null` to match the bootstrap pattern in
// `main.ts` and the sibling `auth-and-me-endpoints.e2e-spec.ts`.
const roleCrudContext = null;
const userRoleAssignmentContext = null;

@Catch()
class LoggingExceptionsFilter implements ExceptionFilter {
  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly delegate: ExceptionsFilter,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    // eslint-disable-next-line no-console
    console.error('[e2e]', exception);
    this.delegate.catch(exception as never, host);
  }
}

describe('ACL rules (static)', () => {
  it('should verify manager cannot delete pets', () => {
    const permission = acRules.can('manager').deleteAny('pet');
    expect(permission.granted).toBe(false);
  });

  it('should verify manager can create, read, and update pets', () => {
    expect(acRules.can('manager').createAny('pet').granted).toBe(true);
    expect(acRules.can('manager').readAny('pet').granted).toBe(true);
    expect(acRules.can('manager').updateAny('pet').granted).toBe(true);
  });

  it('should verify admin can delete pets', () => {
    expect(acRules.can('admin').deleteAny('pet').granted).toBe(true);
  });

  it('should verify user can only delete own pets', () => {
    expect(acRules.can('user').deleteOwn('pet').granted).toBe(true);
    expect(acRules.can('user').deleteAny('pet').granted).toBe(false);
  });
});

describe('Role-Based Access Control (e2e)', () => {
  let app: INestApplication;
  let commandBus: CommandBus;
  let adminToken: string;
  let adminUserId: string;
  let regularUserToken: string;
  let regularUserId: string;
  let managerToken: string;
  let managerUserId: string;
  let adminPetId: string;
  let regularUserPetId: string;

  beforeAll(async () => {
    // Full bootstrap (same as production): TestingModule fails to wire CommandBus/ModuleRef here.
    app = await NestFactory.create(AppModule, {
      logger: ['error', 'warn', 'log'],
    });

    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );

    const httpAdapterHost = app.get(HttpAdapterHost);
    app.useGlobalFilters(
      new LoggingExceptionsFilter(
        httpAdapterHost,
        new ExceptionsFilter(httpAdapterHost),
      ),
    );

    await app.init();

    commandBus = app.get(CommandBus);

    // Create roles (nestjs-role v8 CQRS)
    const adminRoleCreated = await commandBus.execute(
      new CreateRoleCommand(roleCrudContext, ROLE_CRUD_ENTITY_KEY, {
        name: 'admin',
        description: 'Administrator role',
      }),
    );
    const adminRoleId = (
      adminRoleCreated as { toPlain: () => { id: string } }
    ).toPlain().id;

    await commandBus.execute(
      new CreateRoleCommand(roleCrudContext, ROLE_CRUD_ENTITY_KEY, {
        name: 'manager',
        description: 'Manager role with limited permissions (cannot delete)',
      }),
    );

    await commandBus.execute(
      new CreateRoleCommand(roleCrudContext, ROLE_CRUD_ENTITY_KEY, {
        name: 'user',
        description: 'Default role for authenticated users',
      }),
    );

    // Create admin user
    const adminSignupRes = await request(app.getHttpServer())
      .post('/signup')
      .send({
        username: 'user@example.com',
        email: 'user@example.com',
        password: 'StrongP@ssw0rd',
        active: true,
      })
      .expect(201);

    adminUserId = adminSignupRes.body.id;

    // Assign admin role to admin user
    await commandBus.execute(
      new AssignRoleCommand(
        userRoleAssignmentContext,
        USER_ROLE_ENTITY_KEY,
        adminRoleId,
        adminUserId,
      ),
    );
  });

  afterAll(async () => {
    if (app != null) {
      await app.close();
    }
  });

  describe('Admin User', () => {
    it('should login as admin successfully', async () => {
      const response = await request(app.getHttpServer())
        .post('/token/password')
        .send({
          username: 'user@example.com',
          password: 'StrongP@ssw0rd',
        })
        .expect(200);

      expect(response.body.accessToken).toBeDefined();
      adminToken = response.body.accessToken;
    });

    it('should create a pet as admin', async () => {
      const response = await request(app.getHttpServer())
        .post('/pets')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Admin Dog',
          species: 'Dog',
          breed: 'Golden Retriever',
          age: 3,
          status: 'active',
          userId: adminUserId,
        })
        .expect(201);

      expect(response.body.name).toBe('Admin Dog');
      adminPetId = response.body.id;
    });

    it('should get all pets as admin (any permission)', async () => {
      const response = await request(app.getHttpServer())
        .get('/pets')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
    });

    it('should update any pet as admin', async () => {
      await request(app.getHttpServer())
        .patch(`/pets/${adminPetId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          id: adminPetId,
          name: 'Updated Admin Dog',
        })
        .expect(200);
    });

    it('should delete any pet as admin', async () => {
      await request(app.getHttpServer())
        .delete(`/pets/${adminPetId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);
    });
  });

  describe('Regular User (default "user" role)', () => {
    it('should signup a new user successfully', async () => {
      const response = await request(app.getHttpServer())
        .post('/signup')
        .send({
          username: 'regularuser@example.com',
          email: 'regularuser@example.com',
          password: 'UserP@ssw0rd123',
          active: true,
        })
        .expect(201);

      expect(response.body.email).toBe('regularuser@example.com');
      regularUserId = response.body.id;
    });

    it('should login as regular user successfully', async () => {
      const response = await request(app.getHttpServer())
        .post('/token/password')
        .send({
          username: 'regularuser@example.com',
          password: 'UserP@ssw0rd123',
        })
        .expect(200);

      expect(response.body.accessToken).toBeDefined();
      regularUserToken = response.body.accessToken;
    });

    it('should create own pet as regular user', async () => {
      const response = await request(app.getHttpServer())
        .post('/pets')
        .set('Authorization', `Bearer ${regularUserToken}`)
        .send({
          name: 'User Cat',
          species: 'Cat',
          breed: 'Siamese',
          age: 2,
          status: 'active',
          userId: regularUserId,
        })
        .expect(201);

      expect(response.body.name).toBe('User Cat');
      regularUserPetId = response.body.id;
    });

    it('should get own pets as regular user', async () => {
      const response = await request(app.getHttpServer())
        .get('/pets')
        .set('Authorization', `Bearer ${regularUserToken}`)
        .expect(200);

      expect(Array.isArray(response.body.data)).toBe(true);
      // User should only see their own pets
      const userPets = response.body.data.filter(
        (pet: { userId: string }) => pet.userId === regularUserId,
      );
      expect(userPets.length).toBeGreaterThan(0);
    });

    it('should update own pet as regular user', async () => {
      await request(app.getHttpServer())
        .patch(`/pets/${regularUserPetId}`)
        .set('Authorization', `Bearer ${regularUserToken}`)
        .send({
          id: regularUserPetId,
          name: 'Updated User Cat',
        })
        .expect(200);
    });

    it('should delete own pet as regular user', async () => {
      await request(app.getHttpServer())
        .delete(`/pets/${regularUserPetId}`)
        .set('Authorization', `Bearer ${regularUserToken}`)
        .expect(204);
    });

    it('should NOT be able to access other users pets', async () => {
      // Create a pet as admin first
      const adminPetResponse = await request(app.getHttpServer())
        .post('/pets')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Admin Only Pet',
          species: 'Dog',
          age: 1,
          status: 'active',
          userId: adminUserId,
        })
        .expect(201);

      const adminOnlyPetId = adminPetResponse.body.id;

      // Try to access it as regular user - should fail
      await request(app.getHttpServer())
        .get(`/pets/${adminOnlyPetId}`)
        .set('Authorization', `Bearer ${regularUserToken}`)
        .expect(403);

      // Cleanup
      await request(app.getHttpServer())
        .delete(`/pets/${adminOnlyPetId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);
    });
  });

  describe('Manager User (can read, update, but NOT delete)', () => {
    it('should signup a manager user', async () => {
      const response = await request(app.getHttpServer())
        .post('/signup')
        .send({
          username: 'manager@example.com',
          email: 'manager@example.com',
          password: 'ManagerP@ssw0rd123',
          active: true,
        })
        .expect(201);

      managerUserId = response.body.id;
    });

    it('should assign manager role to user (as admin)', async () => {
      // Get manager role ID first
      const rolesResponse = await request(app.getHttpServer())
        .get('/admin/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const managerRole = rolesResponse.body.data.find(
        (role: { name: string; id: string }) => role.name === 'manager',
      );
      expect(managerRole).toBeDefined();

      // Assign manager role
      await request(app.getHttpServer())
        .post(`/admin/users/${managerUserId}/roles`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          roleId: managerRole.id,
        })
        .expect(201);
    });

    it('should login as manager successfully', async () => {
      const response = await request(app.getHttpServer())
        .post('/token/password')
        .send({
          username: 'manager@example.com',
          password: 'ManagerP@ssw0rd123',
        })
        .expect(200);

      expect(response.body.accessToken).toBeDefined();
      managerToken = response.body.accessToken;
    });

    it('should create pets as manager (any permission)', async () => {
      const response = await request(app.getHttpServer())
        .post('/pets')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          name: 'Manager Bird',
          species: 'Bird',
          breed: 'Parrot',
          age: 1,
          status: 'active',
          userId: managerUserId,
        })
        .expect(201);

      expect(response.body.name).toBe('Manager Bird');
    });

    it('should get all pets as manager (any permission)', async () => {
      const response = await request(app.getHttpServer())
        .get('/pets')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);

      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
    });

    it('should update any pet as manager (any permission)', async () => {
      // Create a pet as admin
      const petResponse = await request(app.getHttpServer())
        .post('/pets')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Test Pet for Manager',
          species: 'Dog',
          age: 2,
          status: 'active',
          userId: adminUserId,
        })
        .expect(201);

      const testPetId = petResponse.body.id;

      // Manager should be able to update
      await request(app.getHttpServer())
        .patch(`/pets/${testPetId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          id: testPetId,
          name: 'Updated by Manager',
        })
        .expect(200);

      // Cleanup
      await request(app.getHttpServer())
        .delete(`/pets/${testPetId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);
    });

    it('should NOT be able to delete pets as manager (even own pets)', async () => {
      // Create a pet as manager
      const petResponse = await request(app.getHttpServer())
        .post('/pets')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          name: 'Pet to Test Delete',
          species: 'Cat',
          age: 1,
          status: 'active',
          userId: managerUserId,
        })
        .expect(201);

      const testPetId = petResponse.body.id;

      // Try to delete as manager - should fail with 403 even for own pets
      // Note: Manager role explicitly excludes delete permission
      const deleteResponse = await request(app.getHttpServer())
        .delete(`/pets/${testPetId}`)
        .set('Authorization', `Bearer ${managerToken}`);

      // Manager role has no delete grant (see app.acl); delete is denied before handler.
      expect(deleteResponse.status).toBe(403);

      await request(app.getHttpServer())
        .delete(`/pets/${testPetId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);
    });

    it('should NOT be able to delete other users pets as manager', async () => {
      // Try to delete a pet that belongs to admin (not manager)
      const deleteResponse = await request(app.getHttpServer())
        .delete(`/pets/${adminPetId}`)
        .set('Authorization', `Bearer ${managerToken}`);

      // Manager should NOT be able to delete pets from other users
      expect(deleteResponse.status).toBe(403);
    });
  });

  describe('Unauthenticated Access', () => {
    it('should NOT access protected endpoints without token', async () => {
      await request(app.getHttpServer()).get('/pets').expect(401);
    });

    it('should NOT create pets without authentication', async () => {
      await request(app.getHttpServer())
        .post('/pets')
        .send({
          name: 'Unauthorized Pet',
          species: 'Dog',
          age: 1,
        })
        .expect(401);
    });
  });
});
