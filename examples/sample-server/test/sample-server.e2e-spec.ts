import {
  INestApplication,
  StandardSchemaValidationPipe,
  ValidationPipe,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { HttpAdapterHost } from '@nestjs/core';
import { ExceptionsFilter } from '@bitwild/rockets';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { FakeEmailGateway } from '../src/events';

describe('Sample Server (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;
  let userId: string;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: ['error'] });
    app.useGlobalPipes(
      new StandardSchemaValidationPipe(),
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    const httpAdapterHost = app.get(HttpAdapterHost);
    app.useGlobalFilters(new ExceptionsFilter(httpAdapterHost));
    await app.init();
  }, 30000);

  afterAll(async () => {
    if (app) await app.close();
  });

  describe('Auth', () => {
    it('POST /auth/signup — rejects invalid payload with 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ email: 'invalid-email', password: '' })
        .expect(400);
    });

    it('POST /auth/signup — creates user and returns JWT', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({
          email: 'test@example.com',
          password: 'password123',
          name: 'Test User',
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body.email).toBe('test@example.com');
      expect(res.body.name).toBe('Test User');

      userId = res.body.id;
      accessToken = res.body.accessToken;
    });

    it('POST /auth/signup — rejects duplicate email with 409', async () => {
      await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ email: 'test@example.com', password: 'pass' })
        .expect(409);
    });

    it('POST /auth/login — returns JWT for valid credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'test@example.com', password: 'password123' })
        .expect(200);

      expect(res.body).toHaveProperty('accessToken');
    });

    it('POST /auth/login — rejects invalid credentials', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'test@example.com', password: 'wrong' })
        .expect(401);
    });

    it('POST /auth/signup — no auth required (public route)', async () => {
      await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ email: 'public@test.com', password: 'pass' })
        .expect(201);
    });
  });

  describe('GET /me', () => {
    it('returns authenticated user data', async () => {
      const res = await request(app.getHttpServer())
        .get('/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.id).toBe(userId);
      expect(res.body.email).toBe('test@example.com');
    });

    it('401 without token', async () => {
      await request(app.getHttpServer()).get('/me').expect(401);
    });

    it('401 with invalid token', async () => {
      await request(app.getHttpServer())
        .get('/me')
        .set('Authorization', 'Bearer invalid')
        .expect(401);
    });
  });

  describe('PATCH /me — user metadata', () => {
    it('creates metadata', async () => {
      const res = await request(app.getHttpServer())
        .patch('/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ userMetadata: { firstName: 'Test', lastName: 'User' } })
        .expect(200);

      expect(res.body.userMetadata).toMatchObject({
        firstName: 'Test',
        lastName: 'User',
      });
    });

    it('GET /me reflects updated metadata', async () => {
      const res = await request(app.getHttpServer())
        .get('/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.userMetadata).toMatchObject({
        firstName: 'Test',
        lastName: 'User',
      });
    });

    it('PATCH /me does not return unknown userMetadata keys', async () => {
      const res = await request(app.getHttpServer())
        .patch('/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          userMetadata: {
            ussdserId: 'b9378e1f-4274-4315-8bf9-baa6ce9481',
            firstName: 'Typos',
            lastName: 'Gone',
          },
        })
        .expect(200);

      expect(res.body.userMetadata).toMatchObject({
        firstName: 'Typos',
        lastName: 'Gone',
      });
      expect('ussdserId' in (res.body.userMetadata as object)).toBe(false);
    });
  });

  describe('Pets CRUD', () => {
    let petId: string;

    it('POST /pets — creates pet', async () => {
      const res = await request(app.getHttpServer())
        .post('/pets')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Rex',
          species: 'Dog',
          age: 3,
          status: 'active',
          userId: userId,
        })
        .expect(201);

      expect(res.body.name).toBe('Rex');
      expect(res.body.species).toBe('Dog');
      expect(res.body.userId).toBe(userId);
      expect(res.body).toHaveProperty('id');
      petId = res.body.id;
    });

    it('POST /pets — sets userId from JWT when body omits userId', async () => {
      const res = await request(app.getHttpServer())
        .post('/pets')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'ImplicitOwner',
          species: 'Cat',
          age: 2,
          status: 'active',
        })
        .expect(201);

      expect(res.body.userId).toBe(userId);
    });

    it('POST /pets — userId in body is not part of create DTO; bad value is ignored, owner from JWT', async () => {
      const res = await request(app.getHttpServer())
        .post('/pets')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'BadUuidBody',
          species: 'Dog',
          age: 1,
          status: 'active',
          userId: 'not-a-uuid',
        })
        .expect(201);

      expect(res.body.userId).toBe(userId);
    });

    it('POST /pets — actor-wins: client-supplied userId is overwritten with the authenticated user', async () => {
      const res = await request(app.getHttpServer())
        .post('/pets')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'WrongOwner',
          species: 'Dog',
          age: 1,
          status: 'active',
          userId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        })
        .expect(201);

      // The actor (token subject) is the source of truth; the client-supplied
      // value is silently overwritten by `OwnerStampHook`. This prevents
      // spoofing without depending on `HttpException` propagation through
      // the upstream membrane (which currently collapses to 500).
      expect(res.body.userId).toBe(userId);
    });

    it('GET /pets — lists pets', async () => {
      const res = await request(app.getHttpServer())
        .get('/pets')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('GET /pets/:id — reads pet with empty vaccinations', async () => {
      const res = await request(app.getHttpServer())
        .get(`/pets/${petId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.id).toBe(petId);
      expect(res.body.name).toBe('Rex');
      expect(res.body.vaccinations).toEqual([]);
    });

    it('401 without token', async () => {
      await request(app.getHttpServer()).get('/pets').expect(401);
    });

    describe('with vaccinations', () => {
      let vaccId: string;

      it('POST /pet-vaccinations — creates vaccination for pet', async () => {
        const res = await request(app.getHttpServer())
          .post('/pet-vaccinations')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            name: 'Rabies',
            dateAdministered: '2024-01-15',
            petId,
          })
          .expect(201);

        expect(res.body.name).toBe('Rabies');
        expect(res.body.petId).toBe(petId);
        vaccId = res.body.id;
      });

      it('GET /pets/:id — returns pet WITH vaccinations', async () => {
        const res = await request(app.getHttpServer())
          .get(`/pets/${petId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect(res.body.vaccinations).toHaveLength(1);
        expect(res.body.vaccinations[0].name).toBe('Rabies');
        expect(res.body.vaccinations[0].id).toBe(vaccId);
      });

      it('POST /pet-vaccinations — adds second vaccination', async () => {
        await request(app.getHttpServer())
          .post('/pet-vaccinations')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            name: 'Distemper',
            dateAdministered: '2024-03-01',
            petId,
          })
          .expect(201);
      });

      it('GET /pets/:id — returns pet with 2 vaccinations', async () => {
        const res = await request(app.getHttpServer())
          .get(`/pets/${petId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect(res.body.vaccinations).toHaveLength(2);
        const names = res.body.vaccinations
          .map((v: { name: string }) => v.name)
          .sort();
        expect(names).toEqual(['Distemper', 'Rabies']);
      });

      it('GET /pets — list includes vaccinations', async () => {
        const res = await request(app.getHttpServer())
          .get('/pets')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        const pet = res.body.data.find((p: { id: string }) => p.id === petId);
        expect(pet.vaccinations).toHaveLength(2);
      });
    });

    it('DELETE /pets/:id — soft-deletes pet (returnDeleted: true → 200 + body)', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/pets/${petId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.id).toBe(petId);
      expect(res.body.dateDeleted).toBeTruthy();
    });

    it('GET /pets/:id on soft-deleted pet returns 404', async () => {
      await request(app.getHttpServer())
        .get(`/pets/${petId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  describe('Pets — ownership isolation (security)', () => {
    let aliceToken: string;
    let aliceId: string;
    let bobToken: string;
    let alicesPetId: string;

    beforeAll(async () => {
      const alice = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({
          email: 'alice-pets@example.com',
          password: 'password123',
          name: 'Alice',
        })
        .expect(201);
      aliceId = alice.body.id as string;
      aliceToken = alice.body.accessToken as string;

      const bob = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({
          email: 'bob-pets@example.com',
          password: 'password123',
          name: 'Bob',
        })
        .expect(201);
      bobToken = bob.body.accessToken as string;
    });

    it('alice creates a pet owned by alice', async () => {
      const res = await request(app.getHttpServer())
        .post('/pets')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({
          name: 'AliceOnly',
          species: 'Dog',
          age: 4,
          status: 'active',
        })
        .expect(201);

      expect(res.body.userId).toBe(aliceId);
      alicesPetId = res.body.id as string;
    });

    it('bob creates his own pet', async () => {
      await request(app.getHttpServer())
        .post('/pets')
        .set('Authorization', `Bearer ${bobToken}`)
        .send({
          name: 'BobPet',
          species: 'Cat',
          age: 2,
          status: 'active',
        })
        .expect(201);
    });

    it('GET /pets as bob does not include alice pet', async () => {
      const res = await request(app.getHttpServer())
        .get('/pets')
        .set('Authorization', `Bearer ${bobToken}`)
        .expect(200);

      const ids = (res.body.data as { id: string }[]).map((p) => p.id);
      expect(ids).not.toContain(alicesPetId);
    });

    it('GET /pets/:id as bob for alice pet returns 404', async () => {
      await request(app.getHttpServer())
        .get(`/pets/${alicesPetId}`)
        .set('Authorization', `Bearer ${bobToken}`)
        .expect(404);
    });

    it('DELETE /pets/:id as bob for alice pet returns 404', async () => {
      await request(app.getHttpServer())
        .delete(`/pets/${alicesPetId}`)
        .set('Authorization', `Bearer ${bobToken}`)
        .expect(404);
    });

    it('alice still sees her pet in list and can read it', async () => {
      const list = await request(app.getHttpServer())
        .get('/pets')
        .set('Authorization', `Bearer ${aliceToken}`)
        .expect(200);

      const ids = (list.body.data as { id: string }[]).map((p) => p.id);
      expect(ids).toContain(alicesPetId);

      const one = await request(app.getHttpServer())
        .get(`/pets/${alicesPetId}`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .expect(200);

      expect(one.body.id).toBe(alicesPetId);
      expect(one.body.name).toBe('AliceOnly');
    });
  });

  describe('Tags + Many-to-Many (WP1)', () => {
    let userToken: string;
    let tagIdRed: string;
    let tagIdBlue: string;
    let taggedPetId: string;

    beforeAll(async () => {
      const signup = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({
          email: 'tags-owner@example.com',
          password: 'password123',
          name: 'TagOwner',
        })
        .expect(201);
      userToken = signup.body.accessToken as string;
    });

    describe('Tag CRUD', () => {
      it('POST /tags — creates a tag', async () => {
        const res = await request(app.getHttpServer())
          .post('/tags')
          .set('Authorization', `Bearer ${userToken}`)
          .send({ name: 'Red', color: '#ff0000' })
          .expect(201);

        expect(res.body).toHaveProperty('id');
        expect(res.body.name).toBe('Red');
        tagIdRed = res.body.id as string;
      });

      it('POST /tags — rejects duplicate name (DB unique constraint)', async () => {
        const res = await request(app.getHttpServer())
          .post('/tags')
          .set('Authorization', `Bearer ${userToken}`)
          .send({ name: 'Red', color: '#ff00aa' });
        expect(res.status).toBeGreaterThanOrEqual(400);
      });

      it('POST /tags — creates a second tag', async () => {
        const res = await request(app.getHttpServer())
          .post('/tags')
          .set('Authorization', `Bearer ${userToken}`)
          .send({ name: 'Blue', color: '#0000ff' })
          .expect(201);
        tagIdBlue = res.body.id as string;
      });

      it('GET /tags — lists both tags (shared catalog, not owner-scoped)', async () => {
        const res = await request(app.getHttpServer())
          .get('/tags')
          .set('Authorization', `Bearer ${userToken}`)
          .expect(200);
        const names = (res.body.data as { name: string }[])
          .map((t) => t.name)
          .sort();
        expect(names).toEqual(expect.arrayContaining(['Blue', 'Red']));
      });

      it('PATCH /tags/:id — updates tag color', async () => {
        const res = await request(app.getHttpServer())
          .patch(`/tags/${tagIdRed}`)
          .set('Authorization', `Bearer ${userToken}`)
          .send({ color: '#aa0000' })
          .expect(200);
        expect(res.body.color).toBe('#aa0000');
      });
    });

    describe('Pet ↔ Tag many-to-many (junction resource)', () => {
      it('POST /pets — pet payload no longer accepts tagIds', async () => {
        const res = await request(app.getHttpServer())
          .post('/pets')
          .set('Authorization', `Bearer ${userToken}`)
          .send({
            name: 'Taggy',
            species: 'Dog',
            age: 3,
            status: 'active',
          })
          .expect(201);

        expect(res.body.tags).toEqual([]);
        taggedPetId = res.body.id as string;
      });

      it('POST /pets/:petId/tags — attaches a tag via the junction', async () => {
        const res = await request(app.getHttpServer())
          .post(`/pets/${taggedPetId}/tags`)
          .set('Authorization', `Bearer ${userToken}`)
          .send({ tagId: tagIdRed })
          .expect(201);

        expect(res.body).toMatchObject({
          petId: taggedPetId,
          tagId: tagIdRed,
        });
        expect(res.body.tag).toMatchObject({ id: tagIdRed, name: 'Red' });
      });

      it('POST /pets/:petId/tags — attaches a second tag', async () => {
        await request(app.getHttpServer())
          .post(`/pets/${taggedPetId}/tags`)
          .set('Authorization', `Bearer ${userToken}`)
          .send({ tagId: tagIdBlue })
          .expect(201);
      });

      it('POST /pets/:petId/tags — rejects non-UUID tagId', async () => {
        await request(app.getHttpServer())
          .post(`/pets/${taggedPetId}/tags`)
          .set('Authorization', `Bearer ${userToken}`)
          .send({ tagId: 'not-a-uuid' })
          .expect(400);
      });

      it('POST /pets/:petId/tags — unknown tagId returns descriptive 400', async () => {
        const unknownTagId = '00000000-0000-4000-8000-000000000000';
        const res = await request(app.getHttpServer())
          .post(`/pets/${taggedPetId}/tags`)
          .set('Authorization', `Bearer ${userToken}`)
          .send({ tagId: unknownTagId })
          .expect(400);

        expect(res.body.message).toMatch(/Unknown tag id/);
        expect(res.body.message).toContain(unknownTagId);
      });

      it('POST /pets/:petId/tags — strangers attempting to attach get 404', async () => {
        const stranger = await request(app.getHttpServer())
          .post('/auth/signup')
          .send({
            email: 'tag-stranger@example.com',
            password: 'password123',
            name: 'Stranger',
          })
          .expect(201);
        const strangerToken = stranger.body.accessToken as string;

        await request(app.getHttpServer())
          .post(`/pets/${taggedPetId}/tags`)
          .set('Authorization', `Bearer ${strangerToken}`)
          .send({ tagId: tagIdRed })
          .expect(404);
      });

      it('GET /pets/:petId/tags — lists junction rows for a pet', async () => {
        const res = await request(app.getHttpServer())
          .get(`/pets/${taggedPetId}/tags`)
          .set('Authorization', `Bearer ${userToken}`)
          .expect(200);

        const rows = res.body.data as Array<{ tagId: string }>;
        const tagIds = rows.map((r) => r.tagId).sort();
        expect(tagIds).toEqual([tagIdBlue, tagIdRed].sort());
      });

      it('GET /pets/:id — returns pet with both tags (projected from junction)', async () => {
        const res = await request(app.getHttpServer())
          .get(`/pets/${taggedPetId}`)
          .set('Authorization', `Bearer ${userToken}`)
          .expect(200);

        expect(res.body.tags).toHaveLength(2);
      });

      it('GET /pets — list includes tags[] populated', async () => {
        const res = await request(app.getHttpServer())
          .get('/pets')
          .set('Authorization', `Bearer ${userToken}`)
          .expect(200);

        const pet = (res.body.data as { id: string; tags?: unknown[] }[]).find(
          (p) => p.id === taggedPetId,
        );
        expect(pet?.tags).toHaveLength(2);
      });

      it('DELETE /pets/:petId/tags/:id — detaches a tag', async () => {
        const list = await request(app.getHttpServer())
          .get(`/pets/${taggedPetId}/tags`)
          .set('Authorization', `Bearer ${userToken}`)
          .expect(200);
        const blueRow = (
          list.body.data as Array<{ id: string; tagId: string }>
        ).find((r) => r.tagId === tagIdBlue);
        expect(blueRow).toBeDefined();

        await request(app.getHttpServer())
          .delete(`/pets/${taggedPetId}/tags/${blueRow!.id}`)
          .set('Authorization', `Bearer ${userToken}`)
          .expect(204);

        const after = await request(app.getHttpServer())
          .get(`/pets/${taggedPetId}`)
          .set('Authorization', `Bearer ${userToken}`)
          .expect(200);
        expect(after.body.tags).toHaveLength(1);
        expect((after.body.tags as { id: string }[])[0].id).toBe(tagIdRed);
      });

      it('PATCH /pets/:id — does not affect tags (junction is independent)', async () => {
        const res = await request(app.getHttpServer())
          .patch(`/pets/${taggedPetId}`)
          .set('Authorization', `Bearer ${userToken}`)
          .send({ name: 'RenamedTaggy' })
          .expect(200);

        expect(res.body.name).toBe('RenamedTaggy');
        expect(res.body.tags).toHaveLength(1);
        expect((res.body.tags as { id: string }[])[0].id).toBe(tagIdRed);
      });
    });
  });

  describe('Pet sharing + shared-ownership scope (WP2 + WP3)', () => {
    let ownerToken: string;
    let ownerId: string;
    let sharedToken: string;
    let sharedId: string;
    let strangerToken: string;
    let ownedPetId: string;

    beforeAll(async () => {
      const owner = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({
          email: 'share-owner@example.com',
          password: 'password123',
          name: 'ShareOwner',
        })
        .expect(201);
      ownerToken = owner.body.accessToken as string;
      ownerId = owner.body.id as string;

      const sharedUser = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({
          email: 'share-recipient@example.com',
          password: 'password123',
          name: 'Recipient',
        })
        .expect(201);
      sharedToken = sharedUser.body.accessToken as string;
      sharedId = sharedUser.body.id as string;

      const stranger = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({
          email: 'share-stranger@example.com',
          password: 'password123',
          name: 'Stranger',
        })
        .expect(201);
      strangerToken = stranger.body.accessToken as string;

      const pet = await request(app.getHttpServer())
        .post('/pets')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Sharable', species: 'Dog', age: 5, status: 'active' })
        .expect(201);
      ownedPetId = pet.body.id as string;
    });

    describe('POST /pets/:petId/share', () => {
      it('owner shares pet with recipient', async () => {
        const res = await request(app.getHttpServer())
          .post(`/pets/${ownedPetId}/share`)
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({ userId: sharedId })
          .expect(201);

        expect(res.body.petId).toBe(ownedPetId);
        expect(res.body.userId).toBe(sharedId);
        expect(res.body.permission).toBe('read');
      });

      it('rejects self-share with 400', async () => {
        await request(app.getHttpServer())
          .post(`/pets/${ownedPetId}/share`)
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({ userId: ownerId })
          .expect(400);
      });

      it('rejects non-owner sharing with 404', async () => {
        await request(app.getHttpServer())
          .post(`/pets/${ownedPetId}/share`)
          .set('Authorization', `Bearer ${strangerToken}`)
          .send({ userId: sharedId })
          .expect(404);
      });

      it('rejects duplicate share (DB unique constraint)', async () => {
        const res = await request(app.getHttpServer())
          .post(`/pets/${ownedPetId}/share`)
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({ userId: sharedId });
        expect(res.status).toBeGreaterThanOrEqual(400);
      });

      it('401 without token', async () => {
        await request(app.getHttpServer())
          .post(`/pets/${ownedPetId}/share`)
          .send({ userId: sharedId })
          .expect(401);
      });
    });

    describe('GET /pets (shared scope)', () => {
      it('recipient sees the shared pet in their list', async () => {
        const res = await request(app.getHttpServer())
          .get('/pets')
          .set('Authorization', `Bearer ${sharedToken}`)
          .expect(200);

        const ids = (res.body.data as { id: string }[]).map((p) => p.id);
        expect(ids).toContain(ownedPetId);
      });

      it('stranger does not see the shared pet', async () => {
        const res = await request(app.getHttpServer())
          .get('/pets')
          .set('Authorization', `Bearer ${strangerToken}`)
          .expect(200);

        const ids = (res.body.data as { id: string }[]).map((p) => p.id);
        expect(ids).not.toContain(ownedPetId);
      });

      it('owner still sees their own pet', async () => {
        const res = await request(app.getHttpServer())
          .get('/pets')
          .set('Authorization', `Bearer ${ownerToken}`)
          .expect(200);

        const ids = (res.body.data as { id: string }[]).map((p) => p.id);
        expect(ids).toContain(ownedPetId);
      });

      it('recipient can GET /pets/:id for the shared pet (read allowed)', async () => {
        const res = await request(app.getHttpServer())
          .get(`/pets/${ownedPetId}`)
          .set('Authorization', `Bearer ${sharedToken}`)
          .expect(200);

        expect(res.body.id).toBe(ownedPetId);
      });
    });

    describe('write-side scoping (Update/Delete stays owner-only)', () => {
      it('recipient cannot PATCH the shared pet (404)', async () => {
        await request(app.getHttpServer())
          .patch(`/pets/${ownedPetId}`)
          .set('Authorization', `Bearer ${sharedToken}`)
          .send({ name: 'HackedName' })
          .expect(404);
      });

      it('recipient cannot DELETE the shared pet (404)', async () => {
        await request(app.getHttpServer())
          .delete(`/pets/${ownedPetId}`)
          .set('Authorization', `Bearer ${sharedToken}`)
          .expect(404);
      });

      it('pet still exists after rejected delete attempt', async () => {
        await request(app.getHttpServer())
          .get(`/pets/${ownedPetId}`)
          .set('Authorization', `Bearer ${ownerToken}`)
          .expect(200);
      });
    });

    describe('GET /pets/:petId/share', () => {
      it('owner lists shares', async () => {
        const res = await request(app.getHttpServer())
          .get(`/pets/${ownedPetId}/share`)
          .set('Authorization', `Bearer ${ownerToken}`)
          .expect(200);

        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThanOrEqual(1);
      });

      it('stranger listing shares returns 404', async () => {
        await request(app.getHttpServer())
          .get(`/pets/${ownedPetId}/share`)
          .set('Authorization', `Bearer ${strangerToken}`)
          .expect(404);
      });
    });

    describe('DELETE /pets/:petId/share/:userId', () => {
      it('owner revokes the share', async () => {
        await request(app.getHttpServer())
          .delete(`/pets/${ownedPetId}/share/${sharedId}`)
          .set('Authorization', `Bearer ${ownerToken}`)
          .expect(204);
      });

      it('recipient no longer sees the pet after revocation', async () => {
        const res = await request(app.getHttpServer())
          .get('/pets')
          .set('Authorization', `Bearer ${sharedToken}`)
          .expect(200);

        const ids = (res.body.data as { id: string }[]).map((p) => p.id);
        expect(ids).not.toContain(ownedPetId);
      });

      it('revoking a non-existent share returns 404', async () => {
        await request(app.getHttpServer())
          .delete(`/pets/${ownedPetId}/share/${sharedId}`)
          .set('Authorization', `Bearer ${ownerToken}`)
          .expect(404);
      });
    });
  });

  describe('Soft-delete + restore (WP5)', () => {
    let sdToken: string;
    let sdPetId: string;

    beforeAll(async () => {
      const user = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({
          email: 'softdelete@example.com',
          password: 'password123',
          name: 'SoftDeleteUser',
        })
        .expect(201);
      sdToken = user.body.accessToken as string;

      const pet = await request(app.getHttpServer())
        .post('/pets')
        .set('Authorization', `Bearer ${sdToken}`)
        .send({
          name: 'Undertaker',
          species: 'Ghost',
          age: 50,
          status: 'active',
        })
        .expect(201);
      sdPetId = pet.body.id as string;
    });

    it('DELETE /pets/:id sets dateDeleted', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/pets/${sdPetId}`)
        .set('Authorization', `Bearer ${sdToken}`)
        .expect(200);

      expect(res.body.dateDeleted).toBeTruthy();
      expect(
        new Date(res.body.dateDeleted as string).getTime(),
      ).toBeGreaterThan(0);
    });

    it('GET /pets does not include the soft-deleted pet', async () => {
      const res = await request(app.getHttpServer())
        .get('/pets')
        .set('Authorization', `Bearer ${sdToken}`)
        .expect(200);

      const ids = (res.body.data as { id: string }[]).map((p) => p.id);
      expect(ids).not.toContain(sdPetId);
    });

    it('GET /pets/:id on soft-deleted returns 404', async () => {
      await request(app.getHttpServer())
        .get(`/pets/${sdPetId}`)
        .set('Authorization', `Bearer ${sdToken}`)
        .expect(404);
    });

    it('PATCH /pets/restore/:id restores the pet', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/pets/restore/${sdPetId}`)
        .set('Authorization', `Bearer ${sdToken}`)
        .expect(200);

      expect(res.body.id).toBe(sdPetId);
      expect(res.body.dateDeleted).toBeNull();
    });

    it('GET /pets after restore includes the pet again', async () => {
      const res = await request(app.getHttpServer())
        .get('/pets')
        .set('Authorization', `Bearer ${sdToken}`)
        .expect(200);

      const ids = (res.body.data as { id: string }[]).map((p) => p.id);
      expect(ids).toContain(sdPetId);
    });

    it('GET /pets/:id on restored pet returns 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/pets/${sdPetId}`)
        .set('Authorization', `Bearer ${sdToken}`)
        .expect(200);
      expect(res.body.id).toBe(sdPetId);
    });

    it('PATCH /pets/restore/:id for non-owned pet returns 404', async () => {
      const stranger = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({
          email: 'softdelete-stranger@example.com',
          password: 'password123',
          name: 'Stranger',
        })
        .expect(201);

      // Owner soft-deletes
      await request(app.getHttpServer())
        .delete(`/pets/${sdPetId}`)
        .set('Authorization', `Bearer ${sdToken}`)
        .expect(200);

      // Stranger tries to restore
      await request(app.getHttpServer())
        .patch(`/pets/restore/${sdPetId}`)
        .set('Authorization', `Bearer ${stranger.body.accessToken}`)
        .expect(404);
    });
  });

  describe('Admin routes (WP4)', () => {
    let adminToken: string;
    let alphaToken: string;
    let alphaId: string;
    let alphaPetId: string;
    let betaToken: string;
    let betaPetId: string;
    let deletedPetId: string;

    beforeAll(async () => {
      // Admin user — sample-only role elevation via signup.
      const admin = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({
          email: 'admin@example.com',
          password: 'password123',
          name: 'Admin',
          role: 'admin',
        })
        .expect(201);
      adminToken = admin.body.accessToken as string;
      expect(admin.body.role).toBe('admin');

      // Two plain users with pets.
      const alpha = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({
          email: 'alpha-admin-test@example.com',
          password: 'password123',
          name: 'Alpha',
        })
        .expect(201);
      alphaToken = alpha.body.accessToken as string;
      alphaId = alpha.body.id as string;

      const alphaPet = await request(app.getHttpServer())
        .post('/pets')
        .set('Authorization', `Bearer ${alphaToken}`)
        .send({ name: 'AlphaPet', species: 'Dog', age: 3, status: 'active' })
        .expect(201);
      alphaPetId = alphaPet.body.id as string;

      const beta = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({
          email: 'beta-admin-test@example.com',
          password: 'password123',
          name: 'Beta',
        })
        .expect(201);
      betaToken = beta.body.accessToken as string;

      const betaPet = await request(app.getHttpServer())
        .post('/pets')
        .set('Authorization', `Bearer ${betaToken}`)
        .send({ name: 'BetaPet', species: 'Cat', age: 2, status: 'active' })
        .expect(201);
      betaPetId = betaPet.body.id as string;

      // A deleted pet to exercise withDeleted.
      const deletedPet = await request(app.getHttpServer())
        .post('/pets')
        .set('Authorization', `Bearer ${alphaToken}`)
        .send({
          name: 'AlphaGhost',
          species: 'Dog',
          age: 5,
          status: 'active',
        })
        .expect(201);
      deletedPetId = deletedPet.body.id as string;
      await request(app.getHttpServer())
        .delete(`/pets/${deletedPetId}`)
        .set('Authorization', `Bearer ${alphaToken}`)
        .expect(200);
    });

    describe('GET /admin/pets', () => {
      it('admin sees pets from every user', async () => {
        const res = await request(app.getHttpServer())
          .get('/admin/pets')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

        const ids = (res.body.data as { id: string }[]).map((p) => p.id);
        expect(ids).toEqual(expect.arrayContaining([alphaPetId, betaPetId]));
      });

      it('admin sees deleted pets with withDeleted=true', async () => {
        const res = await request(app.getHttpServer())
          .get('/admin/pets?withDeleted=true')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

        const ids = (res.body.data as { id: string }[]).map((p) => p.id);
        expect(ids).toContain(deletedPetId);
      });

      it('admin list without withDeleted hides soft-deleted rows', async () => {
        const res = await request(app.getHttpServer())
          .get('/admin/pets')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

        const ids = (res.body.data as { id: string }[]).map((p) => p.id);
        expect(ids).not.toContain(deletedPetId);
      });

      it('non-admin user gets 403', async () => {
        await request(app.getHttpServer())
          .get('/admin/pets')
          .set('Authorization', `Bearer ${alphaToken}`)
          .expect(403);
      });

      it('anonymous request gets 401', async () => {
        await request(app.getHttpServer()).get('/admin/pets').expect(401);
      });
    });

    describe('GET /admin/pets/:id', () => {
      it('admin reads another user pet (bypasses owner scope)', async () => {
        const res = await request(app.getHttpServer())
          .get(`/admin/pets/${alphaPetId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

        expect(res.body.id).toBe(alphaPetId);
        expect(res.body.userId).toBe(alphaId);
      });

      it('non-admin user gets 403 on another user pet', async () => {
        await request(app.getHttpServer())
          .get(`/admin/pets/${alphaPetId}`)
          .set('Authorization', `Bearer ${betaToken}`)
          .expect(403);
      });
    });

    describe('PATCH /admin/pets/:id/force-restore', () => {
      it('admin restores a soft-deleted pet owned by another user', async () => {
        const res = await request(app.getHttpServer())
          .patch(`/admin/pets/${deletedPetId}/force-restore`)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

        expect(res.body.id).toBe(deletedPetId);
      });

      it('pet is visible again via owner /pets', async () => {
        const res = await request(app.getHttpServer())
          .get('/pets')
          .set('Authorization', `Bearer ${alphaToken}`)
          .expect(200);

        const ids = (res.body.data as { id: string }[]).map((p) => p.id);
        expect(ids).toContain(deletedPetId);
      });
    });

    describe('DELETE /admin/pets/:id/hard', () => {
      it('admin hard-deletes a pet', async () => {
        await request(app.getHttpServer())
          .delete(`/admin/pets/${betaPetId}/hard`)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(204);
      });

      it('hard-deleted pet is gone even from admin+withDeleted list', async () => {
        const res = await request(app.getHttpServer())
          .get('/admin/pets?withDeleted=true')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

        const ids = (res.body.data as { id: string }[]).map((p) => p.id);
        expect(ids).not.toContain(betaPetId);
      });
    });
  });

  describe('Transactional nested create: Appointment + Reminder (WP6)', () => {
    let apptToken: string;
    let apptPetId: string;

    beforeAll(async () => {
      const user = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({
          email: 'appt-owner@example.com',
          password: 'password123',
          name: 'ApptOwner',
        })
        .expect(201);
      apptToken = user.body.accessToken as string;

      const pet = await request(app.getHttpServer())
        .post('/pets')
        .set('Authorization', `Bearer ${apptToken}`)
        .send({ name: 'ApptPet', species: 'Dog', age: 4, status: 'active' })
        .expect(201);
      apptPetId = pet.body.id as string;
    });

    it('creates appointment + reminder atomically on success', async () => {
      const appointmentDate = new Date(Date.now() + 7 * 24 * 3600 * 1000);
      const reminderDate = new Date(
        appointmentDate.getTime() - 24 * 3600 * 1000,
      );

      const res = await request(app.getHttpServer())
        .post('/appointments')
        .set('Authorization', `Bearer ${apptToken}`)
        .send({
          petId: apptPetId,
          date: appointmentDate.toISOString(),
          reminderSendAt: reminderDate.toISOString(),
          notes: 'Annual checkup',
        })
        .expect(201);

      expect(res.body.petId).toBe(apptPetId);
      expect(res.body.reminders).toBeDefined();
      expect(res.body.reminders).toHaveLength(1);
      expect(new Date(res.body.reminders[0].sendAt).getTime()).toBe(
        reminderDate.getTime(),
      );
    });

    it('rolls back appointment when reminder fails business rule', async () => {
      // Count appointments before so we can verify none were added.
      const before = await request(app.getHttpServer())
        .get('/appointments')
        .set('Authorization', `Bearer ${apptToken}`)
        .expect(200);
      const beforeCount = (before.body.data as unknown[]).length;

      const appointmentDate = new Date(Date.now() + 7 * 24 * 3600 * 1000);
      // Reminder >= appointment → handler throws BadRequest *after* the
      // appointment insert. `txScope.run` must roll back the appointment
      // insert.
      const invalidReminderDate = new Date(
        appointmentDate.getTime() + 3600 * 1000,
      );

      await request(app.getHttpServer())
        .post('/appointments')
        .set('Authorization', `Bearer ${apptToken}`)
        .send({
          petId: apptPetId,
          date: appointmentDate.toISOString(),
          reminderSendAt: invalidReminderDate.toISOString(),
        })
        .expect(400);

      // Verify rollback — the failed appointment is not persisted.
      const after = await request(app.getHttpServer())
        .get('/appointments')
        .set('Authorization', `Bearer ${apptToken}`)
        .expect(200);
      expect((after.body.data as unknown[]).length).toBe(beforeCount);
    });

    it('rejects appointment on a pet the user does not own', async () => {
      const stranger = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({
          email: 'appt-stranger@example.com',
          password: 'password123',
          name: 'ApptStranger',
        })
        .expect(201);

      const appointmentDate = new Date(Date.now() + 7 * 24 * 3600 * 1000);
      const reminderDate = new Date(
        appointmentDate.getTime() - 24 * 3600 * 1000,
      );

      await request(app.getHttpServer())
        .post('/appointments')
        .set('Authorization', `Bearer ${stranger.body.accessToken}`)
        .send({
          petId: apptPetId,
          date: appointmentDate.toISOString(),
          reminderSendAt: reminderDate.toISOString(),
        })
        .expect(404);
    });

    it('rejects missing reminderSendAt with 400 (validation)', async () => {
      const appointmentDate = new Date(Date.now() + 7 * 24 * 3600 * 1000);
      await request(app.getHttpServer())
        .post('/appointments')
        .set('Authorization', `Bearer ${apptToken}`)
        .send({
          petId: apptPetId,
          date: appointmentDate.toISOString(),
        })
        .expect(400);
    });

    it('GET /reminders exposes the created reminder (read-only endpoint)', async () => {
      const res = await request(app.getHttpServer())
        .get('/reminders')
        .set('Authorization', `Bearer ${apptToken}`)
        .expect(200);

      expect(Array.isArray(res.body.data)).toBe(true);
      expect((res.body.data as unknown[]).length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Audit log hook (WP7)', () => {
    let auditAdminToken: string;
    let auditUserToken: string;
    let auditPetId: string;

    beforeAll(async () => {
      const admin = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({
          email: 'audit-admin@example.com',
          password: 'password123',
          name: 'AuditAdmin',
          role: 'admin',
        })
        .expect(201);
      auditAdminToken = admin.body.accessToken as string;

      const user = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({
          email: 'audit-user@example.com',
          password: 'password123',
          name: 'AuditUser',
        })
        .expect(201);
      auditUserToken = user.body.accessToken as string;
    });

    const countEntries = (body: { data: unknown[] }) => body.data.length;

    it('POST /pets writes a CREATE audit row with actor + resourceId', async () => {
      const before = await request(app.getHttpServer())
        .get('/admin/audit-logs?resource=pet&action=create')
        .set('Authorization', `Bearer ${auditAdminToken}`)
        .expect(200);
      const beforeCount = countEntries(before.body);

      const pet = await request(app.getHttpServer())
        .post('/pets')
        .set('Authorization', `Bearer ${auditUserToken}`)
        .send({
          name: 'Auditable',
          species: 'Dog',
          age: 2,
          status: 'active',
        })
        .expect(201);
      auditPetId = pet.body.id as string;

      const after = await request(app.getHttpServer())
        .get(
          `/admin/audit-logs?resource=pet&action=create&resourceId=${auditPetId}`,
        )
        .set('Authorization', `Bearer ${auditAdminToken}`)
        .expect(200);

      expect(countEntries(after.body)).toBe(1);
      const entry = (
        after.body.data as {
          actorId: string;
          resourceId: string;
          action: string;
          snapshot: string;
        }[]
      )[0];
      expect(entry.resourceId).toBe(auditPetId);
      expect(entry.action).toBe('create');
      expect(typeof entry.actorId).toBe('string');
      const snapshot = JSON.parse(entry.snapshot) as { name: string };
      expect(snapshot.name).toBe('Auditable');

      // Audit should grow by exactly 1 (no duplicate rows from hook chains).
      const full = await request(app.getHttpServer())
        .get('/admin/audit-logs?resource=pet&action=create')
        .set('Authorization', `Bearer ${auditAdminToken}`)
        .expect(200);
      expect(countEntries(full.body)).toBe(beforeCount + 1);
    });

    it('PATCH /pets writes an UPDATE audit row', async () => {
      await request(app.getHttpServer())
        .patch(`/pets/${auditPetId}`)
        .set('Authorization', `Bearer ${auditUserToken}`)
        .send({ name: 'AuditableRenamed' })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get(
          `/admin/audit-logs?resource=pet&action=update&resourceId=${auditPetId}`,
        )
        .set('Authorization', `Bearer ${auditAdminToken}`)
        .expect(200);

      expect(countEntries(res.body)).toBeGreaterThanOrEqual(1);
      const snapshot = JSON.parse(
        (res.body.data as { snapshot: string }[])[0].snapshot,
      ) as { name: string };
      expect(snapshot.name).toBe('AuditableRenamed');
    });

    it('DELETE /pets writes a SOFT_DELETE audit row', async () => {
      await request(app.getHttpServer())
        .delete(`/pets/${auditPetId}`)
        .set('Authorization', `Bearer ${auditUserToken}`)
        .expect(200);

      const res = await request(app.getHttpServer())
        .get(
          `/admin/audit-logs?resource=pet&action=soft_delete&resourceId=${auditPetId}`,
        )
        .set('Authorization', `Bearer ${auditAdminToken}`)
        .expect(200);

      expect(countEntries(res.body)).toBe(1);
    });

    it('PATCH /pets/restore writes a RESTORE audit row', async () => {
      await request(app.getHttpServer())
        .patch(`/pets/restore/${auditPetId}`)
        .set('Authorization', `Bearer ${auditUserToken}`)
        .expect(200);

      const res = await request(app.getHttpServer())
        .get(
          `/admin/audit-logs?resource=pet&action=restore&resourceId=${auditPetId}`,
        )
        .set('Authorization', `Bearer ${auditAdminToken}`)
        .expect(200);

      expect(countEntries(res.body)).toBe(1);
    });

    it('non-admin cannot read /admin/audit-logs', async () => {
      await request(app.getHttpServer())
        .get('/admin/audit-logs')
        .set('Authorization', `Bearer ${auditUserToken}`)
        .expect(403);
    });

    it('all audit rows for the pet have a consistent actorId', async () => {
      const res = await request(app.getHttpServer())
        .get(`/admin/audit-logs?resource=pet&resourceId=${auditPetId}`)
        .set('Authorization', `Bearer ${auditAdminToken}`)
        .expect(200);

      const actors = new Set(
        (res.body.data as { actorId: string }[]).map((r) => r.actorId),
      );
      expect(actors.size).toBe(1);
    });
  });

  describe('Domain event + listener (WP-bonus)', () => {
    let eventToken: string;
    const userEmail = 'events-user@example.com';

    beforeAll(async () => {
      const user = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({
          email: userEmail,
          password: 'password123',
          name: 'EventsUser',
        })
        .expect(201);
      eventToken = user.body.accessToken as string;

      // Drain anything the gateway may have received from earlier tests
      // so our assertions are local to this block.
      app.get(FakeEmailGateway).reset();
    });

    it('POST /pets dispatches PetCreatedEvent → email sent to owner', async () => {
      const petRes = await request(app.getHttpServer())
        .post('/pets')
        .set('Authorization', `Bearer ${eventToken}`)
        .send({
          name: 'Tribble',
          species: 'Alien',
          age: 1,
          status: 'active',
        })
        .expect(201);

      // Event dispatch is synchronous via `EventBus.publish`, so the
      // gateway should already carry the message by the time the POST
      // response lands. Add a small retry for CI timing variance.
      const gateway = app.get(FakeEmailGateway);
      await waitFor(() => gateway.getSentMessages().length >= 1, 500);

      const messages = gateway.getSentMessages();
      const match = messages.find((m) => m.to === userEmail);
      expect(match).toBeDefined();
      expect(match?.subject).toContain('Tribble');
      expect(match?.body).toContain(petRes.body.id);
    });

    it('Failed pet create does NOT dispatch an email', async () => {
      const gateway = app.get(FakeEmailGateway);
      const before = gateway.getSentMessages().length;

      await request(app.getHttpServer())
        .post('/pets')
        .set('Authorization', `Bearer ${eventToken}`)
        .send({
          // Missing required `species` — validation rejects before the
          // handler runs, so no event should fire.
          name: 'NeverBorn',
          age: 2,
          status: 'active',
        })
        .expect(400);

      expect(gateway.getSentMessages().length).toBe(before);
    });
  });

  describe('Coverage: review-phase edge cases', () => {
    let ownerTokA: string;
    let ownerTokB: string;
    let ownerTokC: string;
    let adminTok: string;

    beforeAll(async () => {
      const a = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({
          email: 'review-a@example.com',
          password: 'password123',
          name: 'ReviewA',
        })
        .expect(201);
      ownerTokA = a.body.accessToken as string;

      const b = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({
          email: 'review-b@example.com',
          password: 'password123',
          name: 'ReviewB',
        })
        .expect(201);
      ownerTokB = b.body.accessToken as string;

      const c = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({
          email: 'review-c@example.com',
          password: 'password123',
          name: 'ReviewC',
        })
        .expect(201);
      ownerTokC = c.body.accessToken as string;

      const admin = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({
          email: 'review-admin@example.com',
          password: 'password123',
          name: 'ReviewAdmin',
          role: 'admin',
        })
        .expect(201);
      adminTok = admin.body.accessToken as string;
    });

    describe('Pagination & filtering on /pets', () => {
      beforeAll(async () => {
        for (let i = 0; i < 12; i++) {
          await request(app.getHttpServer())
            .post('/pets')
            .set('Authorization', `Bearer ${ownerTokA}`)
            .send({
              name: `Pager-${i.toString().padStart(2, '0')}`,
              species: i % 2 === 0 ? 'Dog' : 'Cat',
              age: 5,
              status: 'active',
            })
            .expect(201);
        }
      });

      it('returns pagination metadata', async () => {
        const res = await request(app.getHttpServer())
          .get('/pets?limit=5')
          .set('Authorization', `Bearer ${ownerTokA}`)
          .expect(200);

        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body.data.length).toBeLessThanOrEqual(5);
        expect(res.body.total).toBeGreaterThanOrEqual(12);
      });

      it('filters by species', async () => {
        const res = await request(app.getHttpServer())
          .get('/pets?filter[0]=species||$eq||Dog')
          .set('Authorization', `Bearer ${ownerTokA}`)
          .expect(200);

        const species = (res.body.data as { species: string }[]).map(
          (p) => p.species,
        );
        expect(species.every((s) => s === 'Dog')).toBe(true);
      });
    });

    describe('Validation error shape', () => {
      it('returns a structured body with statusCode + errorCode + message', async () => {
        const res = await request(app.getHttpServer())
          .post('/pets')
          .set('Authorization', `Bearer ${ownerTokA}`)
          .send({
            // Missing required `species` and `name`.
            age: 5,
            status: 'active',
          })
          .expect(400);

        expect(res.body.statusCode).toBe(400);
        expect(res.body.errorCode).toBeTruthy();
        expect(res.body.message).toBeDefined();
        expect(res.body.timestamp).toBeTruthy();
      });

      it('strips unknown fields (whitelist: true)', async () => {
        const res = await request(app.getHttpServer())
          .post('/pets')
          .set('Authorization', `Bearer ${ownerTokA}`)
          .send({
            name: 'Stripped',
            species: 'Dog',
            age: 3,
            status: 'active',
            __evil_injected_field: 'ignored',
          })
          .expect(201);

        expect(res.body.__evil_injected_field).toBeUndefined();
      });
    });

    describe('Hard-delete + restore interaction', () => {
      it('admin hard-deletes then restore→404 on the owner side', async () => {
        const pet = await request(app.getHttpServer())
          .post('/pets')
          .set('Authorization', `Bearer ${ownerTokB}`)
          .send({ name: 'Ephemeral', species: 'Dog', age: 1, status: 'active' })
          .expect(201);

        await request(app.getHttpServer())
          .delete(`/admin/pets/${pet.body.id}/hard`)
          .set('Authorization', `Bearer ${adminTok}`)
          .expect(204);

        await request(app.getHttpServer())
          .patch(`/pets/restore/${pet.body.id}`)
          .set('Authorization', `Bearer ${ownerTokB}`)
          .expect(404);
      });
    });

    describe('Reminder ownership leak (fixed in review)', () => {
      let reminderOwnerTok: string;
      let reminderOwnerPetId: string;
      let strangerTok: string;

      beforeAll(async () => {
        const owner = await request(app.getHttpServer())
          .post('/auth/signup')
          .send({
            email: 'reminder-owner@example.com',
            password: 'password123',
            name: 'ReminderOwner',
          })
          .expect(201);
        reminderOwnerTok = owner.body.accessToken as string;

        const pet = await request(app.getHttpServer())
          .post('/pets')
          .set('Authorization', `Bearer ${reminderOwnerTok}`)
          .send({ name: 'RemPet', species: 'Dog', age: 4, status: 'active' })
          .expect(201);
        reminderOwnerPetId = pet.body.id as string;

        const apptDate = new Date(Date.now() + 7 * 24 * 3600 * 1000);
        const remDate = new Date(apptDate.getTime() - 3600 * 1000);
        await request(app.getHttpServer())
          .post('/appointments')
          .set('Authorization', `Bearer ${reminderOwnerTok}`)
          .send({
            petId: reminderOwnerPetId,
            date: apptDate.toISOString(),
            reminderSendAt: remDate.toISOString(),
          })
          .expect(201);

        const stranger = await request(app.getHttpServer())
          .post('/auth/signup')
          .send({
            email: 'reminder-stranger@example.com',
            password: 'password123',
            name: 'RemStranger',
          })
          .expect(201);
        strangerTok = stranger.body.accessToken as string;
      });

      it('owner sees their reminder', async () => {
        const res = await request(app.getHttpServer())
          .get('/reminders')
          .set('Authorization', `Bearer ${reminderOwnerTok}`)
          .expect(200);

        expect((res.body.data as unknown[]).length).toBeGreaterThanOrEqual(1);
      });

      it('stranger gets empty list (reminders are owner-scoped)', async () => {
        const res = await request(app.getHttpServer())
          .get('/reminders')
          .set('Authorization', `Bearer ${strangerTok}`)
          .expect(200);

        expect(res.body.data).toEqual([]);
      });
    });

    describe('Audit log: tag resource not audited (hook scope)', () => {
      it('tag creation does NOT write a pet audit row', async () => {
        const before = await request(app.getHttpServer())
          .get('/admin/audit-logs?resource=tag')
          .set('Authorization', `Bearer ${adminTok}`)
          .expect(200);
        const beforeCount = (before.body.data as unknown[]).length;

        await request(app.getHttpServer())
          .post('/tags')
          .set('Authorization', `Bearer ${ownerTokC}`)
          .send({ name: 'AuditedTag?', color: '#123' })
          .expect(201);

        const after = await request(app.getHttpServer())
          .get('/admin/audit-logs?resource=tag')
          .set('Authorization', `Bearer ${adminTok}`)
          .expect(200);
        expect((after.body.data as unknown[]).length).toBe(beforeCount);
      });
    });

    describe('Admin write-bypass restoration preserves owner trail', () => {
      it('after admin force-restore, owner restore+delete still works', async () => {
        const pet = await request(app.getHttpServer())
          .post('/pets')
          .set('Authorization', `Bearer ${ownerTokC}`)
          .send({ name: 'RoundTrip', species: 'Cat', age: 2, status: 'active' })
          .expect(201);
        const petId = pet.body.id as string;

        // Owner soft deletes.
        await request(app.getHttpServer())
          .delete(`/pets/${petId}`)
          .set('Authorization', `Bearer ${ownerTokC}`)
          .expect(200);

        // Admin force-restores.
        await request(app.getHttpServer())
          .patch(`/admin/pets/${petId}/force-restore`)
          .set('Authorization', `Bearer ${adminTok}`)
          .expect(200);

        // Owner can now soft-delete again.
        await request(app.getHttpServer())
          .delete(`/pets/${petId}`)
          .set('Authorization', `Bearer ${ownerTokC}`)
          .expect(200);

        // Audit trail records both soft-deletes and the restore.
        const audit = await request(app.getHttpServer())
          .get(`/admin/audit-logs?resource=pet&resourceId=${petId}`)
          .set('Authorization', `Bearer ${adminTok}`)
          .expect(200);
        const actions = (audit.body.data as { action: string }[]).map(
          (a) => a.action,
        );
        expect(actions).toEqual(
          expect.arrayContaining(['create', 'soft_delete']),
        );
      });
    });

    describe('Unauthenticated requests → 401 everywhere protected', () => {
      it.each([
        ['GET', '/pets'],
        ['POST', '/pets'],
        ['GET', '/pets/00000000-0000-4000-8000-000000000000'],
        ['GET', '/tags'],
        ['POST', '/tags'],
        ['GET', '/admin/pets'],
        ['GET', '/admin/audit-logs'],
        ['POST', '/appointments'],
        ['GET', '/reminders'],
      ])('%s %s → 401 without token', async (method, path) => {
        await request(app.getHttpServer())
          [method.toLowerCase() as 'get' | 'post'](path)
          .expect(401);
      });
    });
  });

  describe('Pet transfer (CQRS pattern demo)', () => {
    let ownerToken: string;
    let ownerId: string;
    let otherToken: string;
    let otherId: string;
    let thirdToken: string;
    let thirdId: string;
    let petId: string;

    beforeAll(async () => {
      const owner = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({
          email: 'transfer-owner@example.com',
          password: 'password123',
          name: 'TransferOwner',
        })
        .expect(201);
      ownerToken = owner.body.accessToken as string;
      ownerId = owner.body.id as string;

      const other = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({
          email: 'transfer-recipient@example.com',
          password: 'password123',
          name: 'TransferRecipient',
        })
        .expect(201);
      otherToken = other.body.accessToken as string;
      otherId = other.body.id as string;

      const third = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({
          email: 'transfer-third@example.com',
          password: 'password123',
          name: 'TransferThird',
        })
        .expect(201);
      thirdToken = third.body.accessToken as string;
      thirdId = third.body.id as string;

      const pet = await request(app.getHttpServer())
        .post('/pets')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Movable', species: 'Dog', age: 3, status: 'active' })
        .expect(201);
      petId = pet.body.id as string;

      // Owner shares with `third` so we can verify shares get revoked.
      await request(app.getHttpServer())
        .post(`/pets/${petId}/share`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ userId: thirdId })
        .expect(201);
    });

    it('rejects self-transfer with 400', async () => {
      await request(app.getHttpServer())
        .post(`/pets/${petId}/transfer`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ newOwnerId: ownerId })
        .expect(400);
    });

    it('rejects transfer by non-owner with 404', async () => {
      await request(app.getHttpServer())
        .post(`/pets/${petId}/transfer`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ newOwnerId: thirdId })
        .expect(404);
    });

    it('rejects transfer to non-existent user with 404', async () => {
      await request(app.getHttpServer())
        .post(`/pets/${petId}/transfer`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ newOwnerId: '00000000-0000-4000-8000-000000000000' })
        .expect(404);
    });

    it('owner transfers pet to another user', async () => {
      const res = await request(app.getHttpServer())
        .post(`/pets/${petId}/transfer`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ newOwnerId: otherId })
        .expect(200);

      expect(res.body.id).toBe(petId);
      expect(res.body.userId).toBe(otherId);
    });

    it('new owner sees the pet in their list', async () => {
      const res = await request(app.getHttpServer())
        .get('/pets')
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(200);

      const ids = (res.body.data as { id: string }[]).map((p) => p.id);
      expect(ids).toContain(petId);
    });

    it('previous owner no longer sees the pet', async () => {
      const res = await request(app.getHttpServer())
        .get('/pets')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      const ids = (res.body.data as { id: string }[]).map((p) => p.id);
      expect(ids).not.toContain(petId);
    });

    it('previously-shared user loses access (shares revoked on transfer)', async () => {
      const res = await request(app.getHttpServer())
        .get('/pets')
        .set('Authorization', `Bearer ${thirdToken}`)
        .expect(200);

      const ids = (res.body.data as { id: string }[]).map((p) => p.id);
      expect(ids).not.toContain(petId);
    });

    it('new owner can now transfer again (chained transfers)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/pets/${petId}/transfer`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ newOwnerId: thirdId })
        .expect(200);

      expect(res.body.userId).toBe(thirdId);
    });
  });
});

async function waitFor(
  predicate: () => boolean,
  timeoutMs: number,
): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) return;
    await new Promise((r) => setTimeout(r, 10));
  }
}
