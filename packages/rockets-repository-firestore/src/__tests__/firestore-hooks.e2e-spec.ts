import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  INestApplication,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import {
  AuthServerGuard,
  defineAuthAdapter,
  defineResource,
  extractBearerToken,
  OwnerScopeHook,
  OwnerStampHook,
  RocketsCoreModule,
  type AuthAdapterInterface,
  type AuthAttemptResult,
  type AuthRequest,
  withOpenApi,
} from '@concepta/rockets-core';
import request from 'supertest';
import { z } from 'zod';

import { InMemoryFirestoreBackend } from '../backends/in-memory-firestore.backend';
import { defineFirestoreRepository } from '../integration/define-firestore-repository';

class OwnedNoteEntity {
  id!: string;
  body!: string;
  userId!: string;
}

const noteResponseSchema = withOpenApi(
  z.object({ id: z.uuid(), body: z.string(), userId: z.string() }),
  'FirestoreHookNoteResponseDto',
);
const noteCreateSchema = withOpenApi(
  z.object({ body: z.string(), userId: z.string().optional() }),
  'FirestoreHookNoteCreateDto',
);
const noteUpdateSchema = withOpenApi(
  z.object({ body: z.string().optional(), userId: z.string().optional() }),
  'FirestoreHookNoteUpdateDto',
);

const ownedNoteResource = defineResource<OwnedNoteEntity>({
  entity: OwnedNoteEntity,
  path: 'firestore-hook-notes',
  hooks: [
    OwnerStampHook.for(OwnedNoteEntity),
    OwnerScopeHook.for(OwnedNoteEntity),
  ],
  operations: {
    list: { output: noteResponseSchema },
    read: { output: noteResponseSchema },
    create: { input: noteCreateSchema, output: noteResponseSchema },
    update: { input: noteUpdateSchema, output: noteResponseSchema },
  },
});

@Injectable()
class TwoUserAuthAdapter implements AuthAdapterInterface {
  async authenticate(authRequest: AuthRequest): Promise<AuthAttemptResult> {
    const token = extractBearerToken(authRequest);
    if (token === null) return { matched: false };
    if (token === 'u1' || token === 'u2') {
      return { matched: true, user: { id: token, sub: token } };
    }
    return { matched: true, error: new UnauthorizedException() };
  }
}

describe('Firestore repository hooks (e2e)', () => {
  let app: INestApplication;

  const post = (token: string, body: object) =>
    request(app.getHttpServer())
      .post('/firestore-hook-notes')
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  const get = (token: string, id?: string) =>
    request(app.getHttpServer())
      .get(`/firestore-hook-notes${id === undefined ? '' : `/${id}`}`)
      .set('Authorization', `Bearer ${token}`);

  const patch = (token: string, id: string, body: object) =>
    request(app.getHttpServer())
      .patch(`/firestore-hook-notes/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  beforeAll(async () => {
    const backend = new InMemoryFirestoreBackend();
    const moduleRef = await Test.createTestingModule({
      imports: [
        RocketsCoreModule.forRoot({
          auth: defineAuthAdapter(TwoUserAuthAdapter),
          providers: [TwoUserAuthAdapter],
          repository: defineFirestoreRepository({ backend }),
          resources: [ownedNoteResource],
          global: true,
        }),
      ],
      providers: [{ provide: APP_GUARD, useClass: AuthServerGuard }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('stamps writes and confines reads and updates to the actor', async () => {
    const mine = await post('u1', {
      body: 'mine',
      userId: 'u2',
    }).expect(201);
    const mineBody = noteResponseSchema.parse(mine.body);
    expect(mineBody.userId).toBe('u1');

    const theirs = await post('u2', { body: 'theirs' }).expect(201);
    const theirsBody = noteResponseSchema.parse(theirs.body);
    expect(theirsBody.userId).toBe('u2');

    const list = await get('u1').expect(200);
    expect(z.array(noteResponseSchema).parse(list.body.data)).toEqual([
      mineBody,
    ]);
    await get('u1', theirsBody.id).expect(404);

    await patch('u1', theirsBody.id, { body: 'stolen' }).expect(404);
    const unchanged = await get('u2', theirsBody.id).expect(200);
    expect(noteResponseSchema.parse(unchanged.body).body).toBe('theirs');

    const updated = await patch('u1', mineBody.id, {
      body: 'updated',
      userId: 'u2',
    }).expect(200);
    expect(noteResponseSchema.parse(updated.body)).toMatchObject({
      body: 'updated',
      userId: 'u1',
    });
  });
});
