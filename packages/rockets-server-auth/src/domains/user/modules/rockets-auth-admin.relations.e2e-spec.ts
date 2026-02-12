import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { HttpAdapterHost } from '@nestjs/core';

import { AppModuleAdminRelationsFixture } from '../../../__fixtures__/admin/app-module-admin-relations.fixture';
import { ExceptionsFilter, RoleEntityInterface } from '@concepta/nestjs-common';
import { RoleModelService, RoleService } from '@concepta/nestjs-role';
import { AdminUserTypeOrmCrudAdapter } from '../../../__fixtures__/admin/admin-user-crud.adapter';

describe('RocketsAuthAdminModule (relations e2e)', () => {
  let app: INestApplication;
  let roleModelService: RoleModelService;
  let roleService: RoleService;
  let adminUserCrudAdapter: AdminUserTypeOrmCrudAdapter;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModuleAdminRelationsFixture],
    }).compile();

    app = moduleFixture.createNestApplication();
    const exceptionsFilter = app.get(HttpAdapterHost);
    app.useGlobalFilters(new ExceptionsFilter(exceptionsFilter));
    app.useGlobalPipes(new ValidationPipe());
    await app.init();

    roleModelService = app.get(RoleModelService);
    roleService = app.get(RoleService);
    adminUserCrudAdapter = app.get(AdminUserTypeOrmCrudAdapter);
  });

  afterAll(async () => {
    await app.close();
  });

  it('should filter and sort by relation fields', async () => {
    // Create admin role
    const adminRole = await roleModelService.create({
      name: 'admin',
      description: 'Administrator role',
    });

    // create user via signup with metadata
    const username = `rel-${Date.now()}`;
    const signupRes = await request(app.getHttpServer())
      .post('/signup')
      .send({
        username,
        email: `${username}@example.com`,
        password: 'Password123!',
        active: true,
        userMetadata: { firstName: 'Zeta' },
      })
      .expect(201);

    // Assign admin role to user
    const userId = signupRes.body.id;
    await roleService.assignRole({
      assignment: 'user',
      role: { id: adminRole.id },
      assignee: { id: userId },
    });

    // login
    const loginRes = await request(app.getHttpServer())
      .post('/token/password')
      .send({ username, password: 'Password123!' })
      .expect(200);
    const token = loginRes.body.accessToken;

    // filter by relation
    const filterRes = await request(app.getHttpServer())
      .get('/admin/users?filter=userMetadata.firstName||$eq||Zeta')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(filterRes.body.data).toBeDefined();
    expect(filterRes.body.data[0].userMetadata).toBeDefined();
    expect(filterRes.body.data[0].userMetadata.firstName).toBe('Zeta');

    // sort by relation
    const sortRes = await request(app.getHttpServer())
      .get('/admin/users?sort[]=userMetadata.firstName,ASC')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(sortRes.body.data).toBeDefined();
    expect(sortRes.body.data[0].userMetadata).toBeDefined();
    expect(sortRes.body.data[0].userMetadata.firstName).toBeDefined();
  });

  it('should update a user via admin endpoint', async () => {
    // Create or get admin role
    const existingRoles = await roleModelService.find({
      where: { name: 'admin' },
    });

    let adminRole: RoleEntityInterface;
    if (existingRoles && existingRoles.length > 0) {
      adminRole = existingRoles[0];
    } else {
      adminRole = await roleModelService.create({
        name: 'admin',
        description: 'Administrator role',
      });
    }

    // create user via signup with metadata
    const username = `update-${Date.now()}`;
    const signupRes = await request(app.getHttpServer())
      .post('/signup')
      .send({
        username,
        email: `${username}@example.com`,
        password: 'Password123!',
        active: true,
        userMetadata: { firstName: 'John', lastName: 'Doe' },
      })
      .expect(201);

    // Assign admin role to user
    const userId = signupRes.body.id;
    await roleService.assignRole({
      assignment: 'user',
      role: { id: adminRole.id },
      assignee: { id: userId },
    });

    // login
    const loginRes = await request(app.getHttpServer())
      .post('/token/password')
      .send({ username, password: 'Password123!' })
      .expect(200);
    const token = loginRes.body.accessToken;

    // update user via admin endpoint
    const updateRes = await request(app.getHttpServer())
      .patch(`/admin/users/${userId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        userMetadata: { firstName: 'Jane', lastName: 'Smith' },
        active: false,
      })
      .expect(200);

    expect(updateRes.body).toBeDefined();
    expect(updateRes.body.id).toBe(userId);
    expect(updateRes.body.active).toBe(false);
    expect(updateRes.body.userMetadata).toBeDefined();
    expect(updateRes.body.userMetadata.firstName).toBe('Jane');
    expect(updateRes.body.userMetadata.lastName).toBe('Smith');

    // verify the update persisted by fetching the user again
    const getRes = await request(app.getHttpServer())
      .get(`/admin/users/${userId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(getRes.body).toBeDefined();
    expect(getRes.body.active).toBe(false);
    expect(getRes.body.userMetadata).toBeDefined();
    expect(getRes.body.userMetadata.firstName).toBe('Jane');
    expect(getRes.body.userMetadata.lastName).toBe('Smith');
  });

  it('should create a user without metadata and add it via patch', async () => {
    // Create or get admin role
    const existingRoles = await roleModelService.find({
      where: { name: 'admin' },
    });

    let adminRole: RoleEntityInterface;
    if (existingRoles && existingRoles.length > 0) {
      adminRole = existingRoles[0];
    } else {
      adminRole = await roleModelService.create({
        name: 'admin',
        description: 'Administrator role',
      });
    }

    // create user via signup WITHOUT metadata
    const username = `no-meta-${Date.now()}`;
    const signupRes = await request(app.getHttpServer())
      .post('/signup')
      .send({
        username,
        email: `${username}@example.com`,
        password: 'Password123!',
        active: true,
      })
      .expect(201);

    // Assign admin role to user
    const userId = signupRes.body.id;
    await roleService.assignRole({
      assignment: 'user',
      role: { id: adminRole.id },
      assignee: { id: userId },
    });

    // login
    const loginRes = await request(app.getHttpServer())
      .post('/token/password')
      .send({ username, password: 'Password123!' })
      .expect(200);
    const token = loginRes.body.accessToken;

    // Verify user has no metadata initially
    const getUserRes = await request(app.getHttpServer())
      .get(`/admin/users/${userId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(getUserRes.body).toBeDefined();
    expect(getUserRes.body.userMetadata).toBeNull();

    // Now patch the user to add metadata
    const patchRes = await request(app.getHttpServer())
      .patch(`/admin/users/${userId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        userMetadata: {
          firstName: 'Added',
          lastName: 'Later',
          bio: 'New metadata',
        },
      })
      .expect(200);

    expect(patchRes.body).toBeDefined();
    expect(patchRes.body.id).toBe(userId);
    expect(patchRes.body.userMetadata).toBeDefined();
    expect(patchRes.body.userMetadata.firstName).toBe('Added');
    expect(patchRes.body.userMetadata.lastName).toBe('Later');
    expect(patchRes.body.userMetadata.bio).toBe('New metadata');

    // Verify the metadata persisted by fetching the user again
    const verifyRes = await request(app.getHttpServer())
      .get(`/admin/users/${userId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(verifyRes.body).toBeDefined();
    expect(verifyRes.body.userMetadata).toBeDefined();
    expect(verifyRes.body.userMetadata.firstName).toBe('Added');
    expect(verifyRes.body.userMetadata.lastName).toBe('Later');
    expect(verifyRes.body.userMetadata.bio).toBe('New metadata');
  });

  it('should fail admin update when metadata persistence fails', async () => {
    const existingRoles = await roleModelService.find({
      where: { name: 'admin' },
    });
    const adminRole =
      existingRoles && existingRoles.length > 0
        ? existingRoles[0]
        : await roleModelService.create({
            name: 'admin',
            description: 'Administrator role',
          });

    const username = `meta-fail-${Date.now()}`;
    const signupRes = await request(app.getHttpServer())
      .post('/signup')
      .send({
        username,
        email: `${username}@example.com`,
        password: 'Password123!',
        active: true,
      })
      .expect(201);

    const userId = signupRes.body.id;
    await roleService.assignRole({
      assignment: 'user',
      role: { id: adminRole.id },
      assignee: { id: userId },
    });

    const loginRes = await request(app.getHttpServer())
      .post('/token/password')
      .send({ username, password: 'Password123!' })
      .expect(200);
    const token = loginRes.body.accessToken;

    const adapterRepo = (
      adminUserCrudAdapter as unknown as {
        repo: {
          manager: {
            transaction: (...args: unknown[]) => Promise<unknown>;
          };
        };
      }
    ).repo;
    const transactionSpy = jest
      .spyOn(adapterRepo.manager, 'transaction')
      .mockImplementationOnce(async () => {
        throw new Error('metadata write failed');
      });

    await request(app.getHttpServer())
      .patch(`/admin/users/${userId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        active: false,
        userMetadata: { firstName: 'ShouldFail' },
      })
      .expect(500);

    expect(transactionSpy).toHaveBeenCalled();
    transactionSpy.mockRestore();

    // Verify transaction rollback semantics for the user update
    const verifyUserRes = await request(app.getHttpServer())
      .get(`/admin/users/${userId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(verifyUserRes.body.active).toBe(true);
  });

  it('should partially update user metadata without affecting other fields', async () => {
    // Create or get admin role
    const existingRoles = await roleModelService.find({
      where: { name: 'admin' },
    });

    let adminRole: RoleEntityInterface;
    if (existingRoles && existingRoles.length > 0) {
      adminRole = existingRoles[0];
    } else {
      adminRole = await roleModelService.create({
        name: 'admin',
        description: 'Administrator role',
      });
    }

    // create user via signup with complete metadata
    const username = `partial-${Date.now()}`;
    const signupRes = await request(app.getHttpServer())
      .post('/signup')
      .send({
        username,
        email: `${username}@example.com`,
        password: 'Password123!',
        active: true,
        userMetadata: {
          firstName: 'John',
          lastName: 'Doe',
          bio: 'Original bio',
          username: 'johndoe',
        },
      })
      .expect(201);

    // Assign admin role to user
    const userId = signupRes.body.id;
    await roleService.assignRole({
      assignment: 'user',
      role: { id: adminRole.id },
      assignee: { id: userId },
    });

    // login
    const loginRes = await request(app.getHttpServer())
      .post('/token/password')
      .send({ username, password: 'Password123!' })
      .expect(200);
    const token = loginRes.body.accessToken;

    // Partially update metadata - only firstName
    const patchRes = await request(app.getHttpServer())
      .patch(`/admin/users/${userId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        userMetadata: { firstName: 'Jane' },
      })
      .expect(200);

    expect(patchRes.body).toBeDefined();
    expect(patchRes.body.userMetadata).toBeDefined();
    expect(patchRes.body.userMetadata.firstName).toBe('Jane');
    // Verify other fields are preserved
    expect(patchRes.body.userMetadata.lastName).toBe('Doe');
    expect(patchRes.body.userMetadata.bio).toBe('Original bio');
    expect(patchRes.body.userMetadata.username).toBe('johndoe');
  });

  it('should update user fields without affecting metadata', async () => {
    // Create or get admin role
    const existingRoles = await roleModelService.find({
      where: { name: 'admin' },
    });

    let adminRole: RoleEntityInterface;
    if (existingRoles && existingRoles.length > 0) {
      adminRole = existingRoles[0];
    } else {
      adminRole = await roleModelService.create({
        name: 'admin',
        description: 'Administrator role',
      });
    }

    // create user via signup with metadata
    const username = `preserve-${Date.now()}`;
    const signupRes = await request(app.getHttpServer())
      .post('/signup')
      .send({
        username,
        email: `${username}@example.com`,
        password: 'Password123!',
        active: true,
        userMetadata: {
          firstName: 'Preserved',
          lastName: 'Metadata',
          bio: 'Should not change',
        },
      })
      .expect(201);

    // Assign admin role to user
    const userId = signupRes.body.id;
    await roleService.assignRole({
      assignment: 'user',
      role: { id: adminRole.id },
      assignee: { id: userId },
    });

    // login
    const loginRes = await request(app.getHttpServer())
      .post('/token/password')
      .send({ username, password: 'Password123!' })
      .expect(200);
    const token = loginRes.body.accessToken;

    // Update only user active status (no metadata in payload)
    const patchRes = await request(app.getHttpServer())
      .patch(`/admin/users/${userId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        active: false,
      })
      .expect(200);

    expect(patchRes.body).toBeDefined();
    expect(patchRes.body.active).toBe(false);
    // Verify metadata is completely unchanged
    expect(patchRes.body.userMetadata).toBeDefined();
    expect(patchRes.body.userMetadata.firstName).toBe('Preserved');
    expect(patchRes.body.userMetadata.lastName).toBe('Metadata');
    expect(patchRes.body.userMetadata.bio).toBe('Should not change');
  });

  it('should reject patch with invalid metadata firstName type', async () => {
    // Create or get admin role
    const existingRoles = await roleModelService.find({
      where: { name: 'admin' },
    });

    let adminRole: RoleEntityInterface;
    if (existingRoles && existingRoles.length > 0) {
      adminRole = existingRoles[0];
    } else {
      adminRole = await roleModelService.create({
        name: 'admin',
        description: 'Administrator role',
      });
    }

    // Create user
    const username = `invalid-patch-${Date.now()}`;
    const signupRes = await request(app.getHttpServer())
      .post('/signup')
      .send({
        username,
        email: `${username}@example.com`,
        password: 'Password123!',
        active: true,
        userMetadata: { firstName: 'John' },
      })
      .expect(201);

    const userId = signupRes.body.id;
    await roleService.assignRole({
      assignment: 'user',
      role: { id: adminRole.id },
      assignee: { id: userId },
    });

    const loginRes = await request(app.getHttpServer())
      .post('/token/password')
      .send({ username, password: 'Password123!' })
      .expect(200);
    const token = loginRes.body.accessToken;

    // Try to patch with invalid firstName (number instead of string)
    await request(app.getHttpServer())
      .patch(`/admin/users/${userId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        userMetadata: { firstName: 123 },
      })
      .expect(400);
  });

  it('should reject patch with metadata firstName too long', async () => {
    // Create or get admin role
    const existingRoles = await roleModelService.find({
      where: { name: 'admin' },
    });

    let adminRole: RoleEntityInterface;
    if (existingRoles && existingRoles.length > 0) {
      adminRole = existingRoles[0];
    } else {
      adminRole = await roleModelService.create({
        name: 'admin',
        description: 'Administrator role',
      });
    }

    // Create user
    const username = `toolong-patch-${Date.now()}`;
    const signupRes = await request(app.getHttpServer())
      .post('/signup')
      .send({
        username,
        email: `${username}@example.com`,
        password: 'Password123!',
        active: true,
        userMetadata: { firstName: 'John' },
      })
      .expect(201);

    const userId = signupRes.body.id;
    await roleService.assignRole({
      assignment: 'user',
      role: { id: adminRole.id },
      assignee: { id: userId },
    });

    const loginRes = await request(app.getHttpServer())
      .post('/token/password')
      .send({ username, password: 'Password123!' })
      .expect(200);
    const token = loginRes.body.accessToken;

    // Try to patch with firstName too long (>100 chars)
    await request(app.getHttpServer())
      .patch(`/admin/users/${userId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        userMetadata: { firstName: 'a'.repeat(101) },
      })
      .expect(400);
  });

  it('should reject patch with metadata firstName empty string', async () => {
    // Create or get admin role
    const existingRoles = await roleModelService.find({
      where: { name: 'admin' },
    });

    let adminRole: RoleEntityInterface;
    if (existingRoles && existingRoles.length > 0) {
      adminRole = existingRoles[0];
    } else {
      adminRole = await roleModelService.create({
        name: 'admin',
        description: 'Administrator role',
      });
    }

    // Create user
    const username = `empty-patch-${Date.now()}`;
    const signupRes = await request(app.getHttpServer())
      .post('/signup')
      .send({
        username,
        email: `${username}@example.com`,
        password: 'Password123!',
        active: true,
        userMetadata: { firstName: 'John' },
      })
      .expect(201);

    const userId = signupRes.body.id;
    await roleService.assignRole({
      assignment: 'user',
      role: { id: adminRole.id },
      assignee: { id: userId },
    });

    const loginRes = await request(app.getHttpServer())
      .post('/token/password')
      .send({ username, password: 'Password123!' })
      .expect(200);
    const token = loginRes.body.accessToken;

    // Try to patch with empty firstName
    await request(app.getHttpServer())
      .patch(`/admin/users/${userId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        userMetadata: { firstName: '' },
      })
      .expect(400);
  });

  it('should reject patch with metadata username too short', async () => {
    // Create or get admin role
    const existingRoles = await roleModelService.find({
      where: { name: 'admin' },
    });

    let adminRole: RoleEntityInterface;
    if (existingRoles && existingRoles.length > 0) {
      adminRole = existingRoles[0];
    } else {
      adminRole = await roleModelService.create({
        name: 'admin',
        description: 'Administrator role',
      });
    }

    // Create user
    const username = `short-username-patch-${Date.now()}`;
    const signupRes = await request(app.getHttpServer())
      .post('/signup')
      .send({
        username,
        email: `${username}@example.com`,
        password: 'Password123!',
        active: true,
        userMetadata: { username: 'validuser' },
      })
      .expect(201);

    const userId = signupRes.body.id;
    await roleService.assignRole({
      assignment: 'user',
      role: { id: adminRole.id },
      assignee: { id: userId },
    });

    const loginRes = await request(app.getHttpServer())
      .post('/token/password')
      .send({ username, password: 'Password123!' })
      .expect(200);
    const token = loginRes.body.accessToken;

    // Try to patch with username too short (<3 chars)
    await request(app.getHttpServer())
      .patch(`/admin/users/${userId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        userMetadata: { username: 'ab' },
      })
      .expect(400);
  });

  it('should reject patch with metadata bio too long', async () => {
    // Create or get admin role
    const existingRoles = await roleModelService.find({
      where: { name: 'admin' },
    });

    let adminRole: RoleEntityInterface;
    if (existingRoles && existingRoles.length > 0) {
      adminRole = existingRoles[0];
    } else {
      adminRole = await roleModelService.create({
        name: 'admin',
        description: 'Administrator role',
      });
    }

    // Create user
    const username = `long-bio-patch-${Date.now()}`;
    const signupRes = await request(app.getHttpServer())
      .post('/signup')
      .send({
        username,
        email: `${username}@example.com`,
        password: 'Password123!',
        active: true,
        userMetadata: { bio: 'Short bio' },
      })
      .expect(201);

    const userId = signupRes.body.id;
    await roleService.assignRole({
      assignment: 'user',
      role: { id: adminRole.id },
      assignee: { id: userId },
    });

    const loginRes = await request(app.getHttpServer())
      .post('/token/password')
      .send({ username, password: 'Password123!' })
      .expect(200);
    const token = loginRes.body.accessToken;

    // Try to patch with bio too long (>500 chars)
    await request(app.getHttpServer())
      .patch(`/admin/users/${userId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        userMetadata: { bio: 'a'.repeat(501) },
      })
      .expect(400);
  });

  it('should accept valid metadata update in patch', async () => {
    // Create or get admin role
    const existingRoles = await roleModelService.find({
      where: { name: 'admin' },
    });

    let adminRole: RoleEntityInterface;
    if (existingRoles && existingRoles.length > 0) {
      adminRole = existingRoles[0];
    } else {
      adminRole = await roleModelService.create({
        name: 'admin',
        description: 'Administrator role',
      });
    }

    // Create user
    const username = `valid-patch-${Date.now()}`;
    const signupRes = await request(app.getHttpServer())
      .post('/signup')
      .send({
        username,
        email: `${username}@example.com`,
        password: 'Password123!',
        active: true,
        userMetadata: { firstName: 'John', lastName: 'Doe' },
      })
      .expect(201);

    const userId = signupRes.body.id;
    await roleService.assignRole({
      assignment: 'user',
      role: { id: adminRole.id },
      assignee: { id: userId },
    });

    const loginRes = await request(app.getHttpServer())
      .post('/token/password')
      .send({ username, password: 'Password123!' })
      .expect(200);
    const token = loginRes.body.accessToken;

    // Valid metadata update
    const patchRes = await request(app.getHttpServer())
      .patch(`/admin/users/${userId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        userMetadata: {
          firstName: 'Jane',
          bio: 'This is a valid bio with good length',
          username: 'janedoe',
        },
      })
      .expect(200);

    expect(patchRes.body.userMetadata).toBeDefined();
    expect(patchRes.body.userMetadata.firstName).toBe('Jane');
    expect(patchRes.body.userMetadata.lastName).toBe('Doe'); // preserved
    expect(patchRes.body.userMetadata.bio).toBe(
      'This is a valid bio with good length',
    );
    expect(patchRes.body.userMetadata.username).toBe('janedoe');
  });

  it('should support complex filtering on metadata fields', async () => {
    // Create admin role
    const existingRoles = await roleModelService.find({
      where: { name: 'admin' },
    });

    let adminRole: RoleEntityInterface;
    if (existingRoles && existingRoles.length > 0) {
      adminRole = existingRoles[0];
    } else {
      adminRole = await roleModelService.create({
        name: 'admin',
        description: 'Administrator role',
      });
    }

    // Create multiple users with different metadata
    const timestamp = Date.now();
    const users = [
      {
        username: `complex-filter-1-${timestamp}`,
        firstName: 'Alice',
        lastName: 'Anderson',
        bio: 'Engineer',
      },
      {
        username: `complex-filter-2-${timestamp}`,
        firstName: 'Bob',
        lastName: 'Brown',
        bio: 'Designer',
      },
      {
        username: `complex-filter-3-${timestamp}`,
        firstName: 'Charlie',
        lastName: 'Anderson',
        bio: 'Manager',
      },
    ];

    let adminToken = '';
    for (const user of users) {
      const signupRes = await request(app.getHttpServer())
        .post('/signup')
        .send({
          username: user.username,
          email: `${user.username}@example.com`,
          password: 'Password123!',
          active: true,
          userMetadata: {
            firstName: user.firstName,
            lastName: user.lastName,
            bio: user.bio,
          },
        })
        .expect(201);

      await roleService.assignRole({
        assignment: 'user',
        role: { id: adminRole.id },
        assignee: { id: signupRes.body.id },
      });

      // Use first user for admin token
      if (!adminToken) {
        const loginRes = await request(app.getHttpServer())
          .post('/token/password')
          .send({ username: user.username, password: 'Password123!' })
          .expect(200);
        adminToken = loginRes.body.accessToken;
      }
    }

    // Filter by lastName = 'Anderson' (should get Alice and Charlie)
    const filterByLastName = await request(app.getHttpServer())
      .get('/admin/users?filter=userMetadata.lastName||$eq||Anderson')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(filterByLastName.body.data).toBeDefined();
    const andersonUsers = filterByLastName.body.data.filter(
      (u: { userMetadata?: { lastName?: string } }) =>
        u.userMetadata?.lastName === 'Anderson',
    );
    expect(andersonUsers.length).toBeGreaterThanOrEqual(2);

    // Filter by firstName containing 'li' (should get Alice and Charlie)
    const filterByFirstNameContains = await request(app.getHttpServer())
      .get('/admin/users?filter=userMetadata.firstName||$cont||li')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(filterByFirstNameContains.body.data).toBeDefined();
    const liUsers = filterByFirstNameContains.body.data.filter(
      (u: { userMetadata?: { firstName?: string } }) =>
        u.userMetadata?.firstName?.toLowerCase().includes('li'),
    );
    expect(liUsers.length).toBeGreaterThanOrEqual(2);
  });

  it('should properly load metadata with pagination', async () => {
    // Create admin role
    const existingRoles = await roleModelService.find({
      where: { name: 'admin' },
    });

    let adminRole: RoleEntityInterface;
    if (existingRoles && existingRoles.length > 0) {
      adminRole = existingRoles[0];
    } else {
      adminRole = await roleModelService.create({
        name: 'admin',
        description: 'Administrator role',
      });
    }

    // Create 10 users with metadata
    const timestamp = Date.now();
    let adminToken = '';
    const createdUserIds: string[] = [];

    for (let i = 0; i < 10; i++) {
      const username = `paginate-${timestamp}-${i}`;
      const signupRes = await request(app.getHttpServer())
        .post('/signup')
        .send({
          username,
          email: `${username}@example.com`,
          password: 'Password123!',
          active: true,
          userMetadata: {
            firstName: `User${i}`,
            lastName: `Test${i}`,
            bio: `Bio ${i}`,
          },
        })
        .expect(201);

      createdUserIds.push(signupRes.body.id);

      await roleService.assignRole({
        assignment: 'user',
        role: { id: adminRole.id },
        assignee: { id: signupRes.body.id },
      });

      // Use first user for admin token
      if (!adminToken) {
        const loginRes = await request(app.getHttpServer())
          .post('/token/password')
          .send({ username, password: 'Password123!' })
          .expect(200);
        adminToken = loginRes.body.accessToken;
      }
    }

    // Test pagination - get first page with limit of 5
    const page1Res = await request(app.getHttpServer())
      .get('/admin/users?page=1&limit=5')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(page1Res.body.data).toBeDefined();
    expect(page1Res.body.data.length).toBeLessThanOrEqual(5);

    // Verify all users in page 1 have metadata loaded
    page1Res.body.data.forEach(
      (user: { id: string; userMetadata?: unknown }) => {
        if (createdUserIds.includes(user.id)) {
          expect(user.userMetadata).toBeDefined();
        }
      },
    );

    // Test pagination - get second page
    const page2Res = await request(app.getHttpServer())
      .get('/admin/users?page=2&limit=5')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(page2Res.body.data).toBeDefined();

    // Verify all users in page 2 have metadata loaded
    page2Res.body.data.forEach(
      (user: { id: string; userMetadata?: unknown }) => {
        if (createdUserIds.includes(user.id)) {
          expect(user.userMetadata).toBeDefined();
        }
      },
    );
  });

  it('should handle null values in metadata and reject empty strings', async () => {
    // Create or get admin role
    const existingRoles = await roleModelService.find({
      where: { name: 'admin' },
    });

    let adminRole: RoleEntityInterface;
    if (existingRoles && existingRoles.length > 0) {
      adminRole = existingRoles[0];
    } else {
      adminRole = await roleModelService.create({
        name: 'admin',
        description: 'Administrator role',
      });
    }

    // First, verify that empty string for firstName is rejected (MinLength validation)
    const invalidUsername = `edge-invalid-${Date.now()}`;
    await request(app.getHttpServer())
      .post('/signup')
      .send({
        username: invalidUsername,
        email: `${invalidUsername}@example.com`,
        password: 'Password123!',
        active: true,
        userMetadata: { firstName: '', lastName: 'Valid', bio: 'Valid bio' },
      })
      .expect(400);

    // Now create user with valid data (null lastName is allowed)
    const username = `edge-${Date.now()}`;
    const signupRes = await request(app.getHttpServer())
      .post('/signup')
      .send({
        username,
        email: `${username}@example.com`,
        password: 'Password123!',
        active: true,
        userMetadata: { firstName: 'Valid', lastName: null, bio: 'Valid bio' },
      })
      .expect(201);

    // Assign admin role to user
    const userId = signupRes.body.id;
    await roleService.assignRole({
      assignment: 'user',
      role: { id: adminRole.id },
      assignee: { id: userId },
    });

    // login
    const loginRes = await request(app.getHttpServer())
      .post('/token/password')
      .send({ username, password: 'Password123!' })
      .expect(200);
    const token = loginRes.body.accessToken;

    // Verify initial values
    const getRes = await request(app.getHttpServer())
      .get(`/admin/users/${userId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(getRes.body).toBeDefined();
    expect(getRes.body.userMetadata).toBeDefined();
    expect(getRes.body.userMetadata.firstName).toBe('Valid');
    expect(getRes.body.userMetadata.lastName).toBeNull();
    expect(getRes.body.userMetadata.bio).toBe('Valid bio');

    // Update to set valid values
    const updateRes = await request(app.getHttpServer())
      .patch(`/admin/users/${userId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        userMetadata: { lastName: 'Now Valid' },
      })
      .expect(200);

    expect(updateRes.body.userMetadata.firstName).toBe('Valid');
    expect(updateRes.body.userMetadata.lastName).toBe('Now Valid');
    expect(updateRes.body.userMetadata.bio).toBe('Valid bio');
  });

  it('should handle multiple sequential metadata updates correctly', async () => {
    // Create or get admin role
    const existingRoles = await roleModelService.find({
      where: { name: 'admin' },
    });

    let adminRole: RoleEntityInterface;
    if (existingRoles && existingRoles.length > 0) {
      adminRole = existingRoles[0];
    } else {
      adminRole = await roleModelService.create({
        name: 'admin',
        description: 'Administrator role',
      });
    }

    // create user via signup with initial metadata
    const username = `sequential-${Date.now()}`;
    const signupRes = await request(app.getHttpServer())
      .post('/signup')
      .send({
        username,
        email: `${username}@example.com`,
        password: 'Password123!',
        active: true,
        userMetadata: {
          firstName: 'Version1',
          lastName: 'Test',
          bio: 'Initial',
        },
      })
      .expect(201);

    // Assign admin role to user
    const userId = signupRes.body.id;
    await roleService.assignRole({
      assignment: 'user',
      role: { id: adminRole.id },
      assignee: { id: userId },
    });

    // login
    const loginRes = await request(app.getHttpServer())
      .post('/token/password')
      .send({ username, password: 'Password123!' })
      .expect(200);
    const token = loginRes.body.accessToken;

    // First update
    const update1Res = await request(app.getHttpServer())
      .patch(`/admin/users/${userId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        userMetadata: { firstName: 'Version2', bio: 'Update 1' },
      })
      .expect(200);

    expect(update1Res.body.userMetadata.firstName).toBe('Version2');
    expect(update1Res.body.userMetadata.bio).toBe('Update 1');

    // Second update
    const update2Res = await request(app.getHttpServer())
      .patch(`/admin/users/${userId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        userMetadata: { lastName: 'Updated', bio: 'Update 2' },
      })
      .expect(200);

    expect(update2Res.body.userMetadata.firstName).toBe('Version2'); // preserved from update 1
    expect(update2Res.body.userMetadata.lastName).toBe('Updated');
    expect(update2Res.body.userMetadata.bio).toBe('Update 2');

    // Third update
    const update3Res = await request(app.getHttpServer())
      .patch(`/admin/users/${userId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        userMetadata: { firstName: 'FinalVersion', username: 'finaluser' },
      })
      .expect(200);

    expect(update3Res.body.userMetadata.firstName).toBe('FinalVersion');
    expect(update3Res.body.userMetadata.lastName).toBe('Updated'); // preserved from update 2
    expect(update3Res.body.userMetadata.bio).toBe('Update 2'); // preserved from update 2
    expect(update3Res.body.userMetadata.username).toBe('finaluser');

    // Verify final state with a GET request
    const finalGetRes = await request(app.getHttpServer())
      .get(`/admin/users/${userId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const metadata = finalGetRes.body.userMetadata;
    expect(metadata.firstName).toBe('FinalVersion');
    expect(metadata.lastName).toBe('Updated');
    expect(metadata.bio).toBe('Update 2');
    expect(metadata.username).toBe('finaluser');
  });

  it('should support sorting by multiple metadata fields', async () => {
    // Create admin role
    const existingRoles = await roleModelService.find({
      where: { name: 'admin' },
    });

    let adminRole: RoleEntityInterface;
    if (existingRoles && existingRoles.length > 0) {
      adminRole = existingRoles[0];
    } else {
      adminRole = await roleModelService.create({
        name: 'admin',
        description: 'Administrator role',
      });
    }

    // Create users with specific names for sorting
    const timestamp = Date.now();
    const users = [
      {
        username: `sort-1-${timestamp}`,
        firstName: 'Alice',
        lastName: 'Smith',
      },
      {
        username: `sort-2-${timestamp}`,
        firstName: 'Bob',
        lastName: 'Anderson',
      },
      {
        username: `sort-3-${timestamp}`,
        firstName: 'Charlie',
        lastName: 'Smith',
      },
      {
        username: `sort-4-${timestamp}`,
        firstName: 'David',
        lastName: 'Anderson',
      },
    ];

    let adminToken = '';
    for (const user of users) {
      const signupRes = await request(app.getHttpServer())
        .post('/signup')
        .send({
          username: user.username,
          email: `${user.username}@example.com`,
          password: 'Password123!',
          active: true,
          userMetadata: { firstName: user.firstName, lastName: user.lastName },
        })
        .expect(201);

      await roleService.assignRole({
        assignment: 'user',
        role: { id: adminRole.id },
        assignee: { id: signupRes.body.id },
      });

      // Use first user for admin token
      if (!adminToken) {
        const loginRes = await request(app.getHttpServer())
          .post('/token/password')
          .send({ username: user.username, password: 'Password123!' })
          .expect(200);
        adminToken = loginRes.body.accessToken;
      }
    }

    // Sort by lastName ASC, then firstName ASC
    const sortRes = await request(app.getHttpServer())
      .get(
        '/admin/users?sort[]=userMetadata.lastName,ASC&sort[]=userMetadata.firstName,ASC',
      )
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(sortRes.body.data).toBeDefined();

    // Filter to only our test users and verify order
    const testUsers = sortRes.body.data.filter(
      (u: { username: string }) =>
        u.username.startsWith(`sort-`) && u.username.endsWith(`-${timestamp}`),
    );

    if (testUsers.length >= 4) {
      // Expected order: Anderson (Bob, David), Smith (Alice, Charlie)
      const lastNames = testUsers.map(
        (u: { userMetadata?: { lastName?: string } }) =>
          u.userMetadata?.lastName,
      );

      // Verify Andersons come before Smiths
      const firstAndersonIndex = lastNames.indexOf('Anderson');
      const firstSmithIndex = lastNames.indexOf('Smith');
      if (firstAndersonIndex >= 0 && firstSmithIndex >= 0) {
        expect(firstAndersonIndex).toBeLessThan(firstSmithIndex);
      }
    }
  });
});
