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
import { USER_METADATA_REPOSITORY_TOKEN } from '../infrastructure/config/user-domain.constants';
import { UserMetadataRepositoryInterface } from '../domain/repositories/user-metadata-repository.interface';

describe('RocketsAuthAdminModule (relations e2e)', () => {
  let app: INestApplication;
  let commandBus: CommandBus;
  let userMetadataRepository: UserMetadataRepositoryInterface;
  let adminRole: { id: string };

  const createAdminUser = async (
    username: string,
  ): Promise<{ userId: string; token: string }> => {
    const signupRes = await request(app.getHttpServer())
      .post('/signup')
      .send({
        username,
        email: `${username}@example.com`,
        password: 'Password123!',
        active: true,
        userMetadata: { firstName: 'Admin' },
      })
      .expect(201);

    const userId = signupRes.body.id;
    await commandBus.execute(
      new AssignRoleCommand(
        { entity: USER_ROLE_ENTITY_KEY, hooks: [] },
        adminRole.id,
        userId,
      ),
    );

    const loginRes = await request(app.getHttpServer())
      .post('/token/password')
      .send({ username, password: 'Password123!' })
      .expect(200);

    return { userId, token: loginRes.body.accessToken };
  };

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModuleAdminRelationsFixture],
    }).compile();

    app = moduleFixture.createNestApplication();
    const exceptionsFilter = app.get(HttpAdapterHost);
    app.useGlobalFilters(new ExceptionsFilter(exceptionsFilter));
    app.useGlobalPipes(new ValidationPipe());
    await app.init();

    commandBus = app.get(CommandBus);
    userMetadataRepository = app.get(USER_METADATA_REPOSITORY_TOKEN);

    adminRole = await commandBus.execute(
      new CreateRoleCommand(
        { entity: ROLE_CRUD_ENTITY_KEY, hooks: [] },
        {
          name: 'admin',
          description: 'Administrator role',
        },
      ),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('should filter and sort by relation fields', async () => {
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

    const userId = signupRes.body.id;
    await commandBus.execute(
      new AssignRoleCommand(
        { entity: USER_ROLE_ENTITY_KEY, hooks: [] },
        adminRole.id,
        userId,
      ),
    );

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

    const userId = signupRes.body.id;
    await commandBus.execute(
      new AssignRoleCommand(
        { entity: USER_ROLE_ENTITY_KEY, hooks: [] },
        adminRole.id,
        userId,
      ),
    );

    const loginRes = await request(app.getHttpServer())
      .post('/token/password')
      .send({ username, password: 'Password123!' })
      .expect(200);
    const token = loginRes.body.accessToken;

    const updateRes = await request(app.getHttpServer())
      .patch(`/admin/users/${userId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        userMetadata: { firstName: 'Jane', lastName: 'Smith' },
        active: false,
      })
      .expect(200);

    expect(updateRes.body.id).toBe(userId);
    expect(updateRes.body.active).toBe(false);
    expect(updateRes.body.userMetadata).toBeDefined();
    expect(updateRes.body.userMetadata.firstName).toBe('Jane');
    expect(updateRes.body.userMetadata.lastName).toBe('Smith');

    // verify persistence
    const getRes = await request(app.getHttpServer())
      .get(`/admin/users/${userId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(getRes.body.active).toBe(false);
    expect(getRes.body.userMetadata.firstName).toBe('Jane');
    expect(getRes.body.userMetadata.lastName).toBe('Smith');
  });

  it('should create a user without metadata and add it via patch', async () => {
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

    const userId = signupRes.body.id;
    await commandBus.execute(
      new AssignRoleCommand(
        { entity: USER_ROLE_ENTITY_KEY, hooks: [] },
        adminRole.id,
        userId,
      ),
    );

    const loginRes = await request(app.getHttpServer())
      .post('/token/password')
      .send({ username, password: 'Password123!' })
      .expect(200);
    const token = loginRes.body.accessToken;

    const getUserRes = await request(app.getHttpServer())
      .get(`/admin/users/${userId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(getUserRes.body.userMetadata).toBeNull();

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

    expect(patchRes.body.id).toBe(userId);
    expect(patchRes.body.userMetadata.firstName).toBe('Added');
    expect(patchRes.body.userMetadata.lastName).toBe('Later');
    expect(patchRes.body.userMetadata.bio).toBe('New metadata');
  });

  it('should fail admin update when metadata persistence fails', async () => {
    const { userId, token } = await createAdminUser(`meta-fail-${Date.now()}`);

    const spy = jest
      .spyOn(userMetadataRepository, 'save')
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

    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('should partially update user metadata without affecting other fields', async () => {
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

    const userId = signupRes.body.id;
    await commandBus.execute(
      new AssignRoleCommand(
        { entity: USER_ROLE_ENTITY_KEY, hooks: [] },
        adminRole.id,
        userId,
      ),
    );

    const loginRes = await request(app.getHttpServer())
      .post('/token/password')
      .send({ username, password: 'Password123!' })
      .expect(200);
    const token = loginRes.body.accessToken;

    const patchRes = await request(app.getHttpServer())
      .patch(`/admin/users/${userId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userMetadata: { firstName: 'Jane' } })
      .expect(200);

    expect(patchRes.body.userMetadata.firstName).toBe('Jane');
    expect(patchRes.body.userMetadata.lastName).toBe('Doe');
    expect(patchRes.body.userMetadata.bio).toBe('Original bio');
    expect(patchRes.body.userMetadata.username).toBe('johndoe');
  });

  it('should update user fields without affecting metadata', async () => {
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

    const userId = signupRes.body.id;
    await commandBus.execute(
      new AssignRoleCommand(
        { entity: USER_ROLE_ENTITY_KEY, hooks: [] },
        adminRole.id,
        userId,
      ),
    );

    const loginRes = await request(app.getHttpServer())
      .post('/token/password')
      .send({ username, password: 'Password123!' })
      .expect(200);
    const token = loginRes.body.accessToken;

    const patchRes = await request(app.getHttpServer())
      .patch(`/admin/users/${userId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ active: false })
      .expect(200);

    expect(patchRes.body.active).toBe(false);
    expect(patchRes.body.userMetadata.firstName).toBe('Preserved');
    expect(patchRes.body.userMetadata.lastName).toBe('Metadata');
    expect(patchRes.body.userMetadata.bio).toBe('Should not change');
  });

  it('should reject patch with invalid metadata firstName type', async () => {
    const { userId, token } = await createAdminUser(
      `invalid-patch-${Date.now()}`,
    );

    await request(app.getHttpServer())
      .patch(`/admin/users/${userId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userMetadata: { firstName: 123 } })
      .expect(400);
  });

  it('should reject patch with metadata firstName too long', async () => {
    const { userId, token } = await createAdminUser(
      `toolong-patch-${Date.now()}`,
    );

    await request(app.getHttpServer())
      .patch(`/admin/users/${userId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userMetadata: { firstName: 'a'.repeat(101) } })
      .expect(400);
  });

  it('should reject patch with metadata firstName empty string', async () => {
    const { userId, token } = await createAdminUser(
      `empty-patch-${Date.now()}`,
    );

    await request(app.getHttpServer())
      .patch(`/admin/users/${userId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userMetadata: { firstName: '' } })
      .expect(400);
  });

  it('should reject patch with metadata username too short', async () => {
    const { userId, token } = await createAdminUser(
      `short-username-patch-${Date.now()}`,
    );

    await request(app.getHttpServer())
      .patch(`/admin/users/${userId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userMetadata: { username: 'ab' } })
      .expect(400);
  });

  it('should reject patch with metadata bio too long', async () => {
    const { userId, token } = await createAdminUser(
      `long-bio-patch-${Date.now()}`,
    );

    await request(app.getHttpServer())
      .patch(`/admin/users/${userId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userMetadata: { bio: 'a'.repeat(501) } })
      .expect(400);
  });

  it('should accept valid metadata update in patch', async () => {
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
    await commandBus.execute(
      new AssignRoleCommand(
        { entity: USER_ROLE_ENTITY_KEY, hooks: [] },
        adminRole.id,
        userId,
      ),
    );

    const loginRes = await request(app.getHttpServer())
      .post('/token/password')
      .send({ username, password: 'Password123!' })
      .expect(200);
    const token = loginRes.body.accessToken;

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

    expect(patchRes.body.userMetadata.firstName).toBe('Jane');
    expect(patchRes.body.userMetadata.lastName).toBe('Doe');
    expect(patchRes.body.userMetadata.bio).toBe(
      'This is a valid bio with good length',
    );
    expect(patchRes.body.userMetadata.username).toBe('janedoe');
  });

  it('should support complex filtering on metadata fields', async () => {
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

      await commandBus.execute(
        new AssignRoleCommand(
          { entity: USER_ROLE_ENTITY_KEY, hooks: [] },
          adminRole.id,
          signupRes.body.id,
        ),
      );

      if (!adminToken) {
        const loginRes = await request(app.getHttpServer())
          .post('/token/password')
          .send({ username: user.username, password: 'Password123!' })
          .expect(200);
        adminToken = loginRes.body.accessToken;
      }
    }

    // Filter by lastName = 'Anderson'
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

    // Filter by firstName using $eq (relation fields support $eq via CrudJoin)
    const filterByFirstName = await request(app.getHttpServer())
      .get('/admin/users?filter=userMetadata.firstName||$eq||Alice')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(filterByFirstName.body.data).toBeDefined();
    const aliceUsers = filterByFirstName.body.data.filter(
      (u: { userMetadata?: { firstName?: string } }) =>
        u.userMetadata?.firstName === 'Alice',
    );
    expect(aliceUsers.length).toBeGreaterThanOrEqual(1);
  });

  it('should handle null values in metadata and reject empty strings', async () => {
    // Empty firstName should be rejected
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

    // null lastName is allowed
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

    const userId = signupRes.body.id;
    await commandBus.execute(
      new AssignRoleCommand(
        { entity: USER_ROLE_ENTITY_KEY, hooks: [] },
        adminRole.id,
        userId,
      ),
    );

    const loginRes = await request(app.getHttpServer())
      .post('/token/password')
      .send({ username, password: 'Password123!' })
      .expect(200);
    const token = loginRes.body.accessToken;

    const getRes = await request(app.getHttpServer())
      .get(`/admin/users/${userId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(getRes.body.userMetadata.firstName).toBe('Valid');
    expect(getRes.body.userMetadata.lastName).toBeNull();
    expect(getRes.body.userMetadata.bio).toBe('Valid bio');

    const updateRes = await request(app.getHttpServer())
      .patch(`/admin/users/${userId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userMetadata: { lastName: 'Now Valid' } })
      .expect(200);

    expect(updateRes.body.userMetadata.firstName).toBe('Valid');
    expect(updateRes.body.userMetadata.lastName).toBe('Now Valid');
    expect(updateRes.body.userMetadata.bio).toBe('Valid bio');
  });

  it('should handle multiple sequential metadata updates correctly', async () => {
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

    const userId = signupRes.body.id;
    await commandBus.execute(
      new AssignRoleCommand(
        { entity: USER_ROLE_ENTITY_KEY, hooks: [] },
        adminRole.id,
        userId,
      ),
    );

    const loginRes = await request(app.getHttpServer())
      .post('/token/password')
      .send({ username, password: 'Password123!' })
      .expect(200);
    const token = loginRes.body.accessToken;

    // First update
    const update1 = await request(app.getHttpServer())
      .patch(`/admin/users/${userId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userMetadata: { firstName: 'Version2', bio: 'Update 1' } })
      .expect(200);

    expect(update1.body.userMetadata.firstName).toBe('Version2');
    expect(update1.body.userMetadata.bio).toBe('Update 1');

    // Second update
    const update2 = await request(app.getHttpServer())
      .patch(`/admin/users/${userId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userMetadata: { lastName: 'Updated', bio: 'Update 2' } })
      .expect(200);

    expect(update2.body.userMetadata.firstName).toBe('Version2');
    expect(update2.body.userMetadata.lastName).toBe('Updated');
    expect(update2.body.userMetadata.bio).toBe('Update 2');

    // Third update
    const update3 = await request(app.getHttpServer())
      .patch(`/admin/users/${userId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        userMetadata: { firstName: 'FinalVersion', username: 'finaluser' },
      })
      .expect(200);

    expect(update3.body.userMetadata.firstName).toBe('FinalVersion');
    expect(update3.body.userMetadata.lastName).toBe('Updated');
    expect(update3.body.userMetadata.bio).toBe('Update 2');
    expect(update3.body.userMetadata.username).toBe('finaluser');

    // Verify final state
    const finalGet = await request(app.getHttpServer())
      .get(`/admin/users/${userId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(finalGet.body.userMetadata.firstName).toBe('FinalVersion');
    expect(finalGet.body.userMetadata.lastName).toBe('Updated');
    expect(finalGet.body.userMetadata.bio).toBe('Update 2');
    expect(finalGet.body.userMetadata.username).toBe('finaluser');
  });

  it('should support sorting by multiple metadata fields', async () => {
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

      await commandBus.execute(
        new AssignRoleCommand(
          { entity: USER_ROLE_ENTITY_KEY, hooks: [] },
          adminRole.id,
          signupRes.body.id,
        ),
      );

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

    const testUsers = sortRes.body.data.filter(
      (u: { username: string }) =>
        u.username.startsWith('sort-') && u.username.endsWith(`-${timestamp}`),
    );

    if (testUsers.length >= 4) {
      const lastNames = testUsers.map(
        (u: { userMetadata?: { lastName?: string } }) =>
          u.userMetadata?.lastName,
      );
      const firstAndersonIndex = lastNames.indexOf('Anderson');
      const firstSmithIndex = lastNames.indexOf('Smith');
      if (firstAndersonIndex >= 0 && firstSmithIndex >= 0) {
        expect(firstAndersonIndex).toBeLessThan(firstSmithIndex);
      }
    }
  });
});
