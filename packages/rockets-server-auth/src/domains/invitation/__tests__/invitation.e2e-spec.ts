import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import 'reflect-metadata';

import { INestApplication } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AssignRoleCommand, CreateRoleCommand } from '@concepta/nestjs-role';
import {
  AppContextHost,
  getDynamicRepositoryToken,
  type RepositoryInterface,
} from '@concepta/rockets-core';

import {
  applyRocketsAuthE2eAppGlobals,
  createRocketsAuthStandardE2eTestingModule,
} from '../../../__e2e__/helpers/rockets-auth-e2e-app.factory';
import {
  ROLE_CRUD_ENTITY_KEY,
  USER_CREDENTIALS_ENTITY_KEY,
  USER_OTP_ENTITY_KEY,
  USER_ROLE_ENTITY_KEY,
} from '../../../shared/constants/repository-entity-keys.constants';

const INVITATION_RESPONSE_KEYS = [
  'id',
  'version',
  'dateCreated',
  'dateUpdated',
  'dateDeleted',
  'active',
  'code',
  'category',
  'constraints',
  'userId',
  'dateAccepted',
  'dateRevoked',
];

describe('Invitations (e2e)', () => {
  let app: INestApplication;
  let module: TestingModule;
  let adminToken: string;
  let memberToken: string;
  const mockEmail = { sendMail: vi.fn().mockResolvedValue(undefined) };

  /**
   * Upstream sends the invitation email from the transaction's commit hook,
   * i.e. after the HTTP response: wait for the next delivery.
   */
  async function nextEmail(after: number): Promise<{
    to: string;
    passcode: string;
  }> {
    const deadline = Date.now() + 5_000;
    while (mockEmail.sendMail.mock.calls.length <= after) {
      if (Date.now() > deadline) throw new Error('no invitation email sent');
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    const call = mockEmail.sendMail.mock.calls[after][0] as {
      to: string;
      context: { passcode: string };
    };
    return { to: call.to, passcode: call.context.passcode };
  }

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

  async function login(username: string, password: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/token/password')
      .send({ username, password })
      .expect(200);
    return res.body.accessToken as string;
  }

  /**
   * Activation and the password are written by the InvitationAcceptedEvent
   * listener, after the acceptance response; wait until both landed.
   */
  async function waitForOnboarding(userId: string): Promise<void> {
    const credentials = app.get<
      RepositoryInterface<{ userId: string; active: boolean }>
    >(getDynamicRepositoryToken(USER_CREDENTIALS_ENTITY_KEY));
    const deadline = Date.now() + 5_000;
    for (;;) {
      const user = await request(app.getHttpServer())
        .get(`/admin/users/${userId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const rows = await credentials.find({});
      if (
        user.body.active === true &&
        rows.some((row) => row.userId === userId && row.active)
      ) {
        return;
      }
      if (Date.now() > deadline) throw new Error('user never onboarded');
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  async function invite(
    email: string,
  ): Promise<{ code: string; userId: string; passcode: string }> {
    const sent = mockEmail.sendMail.mock.calls.length;
    const res = await request(app.getHttpServer())
      .post('/admin/invitations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email, category: 'user' })
      .expect(201);
    const delivered = await nextEmail(sent);
    expect(delivered.to).toBe(email);
    return {
      code: res.body.code as string,
      userId: res.body.userId as string,
      passcode: delivered.passcode,
    };
  }

  beforeAll(async () => {
    module = await createRocketsAuthStandardE2eTestingModule({
      mockEmailService: mockEmail,
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
    const adminRoleId = (
      adminRole as { toPlain: () => { id: string } }
    ).toPlain().id;
    const adminUserId = await signup('invitations-admin');
    await commandBus.execute(
      new AssignRoleCommand(
        new AppContextHost(),
        USER_ROLE_ENTITY_KEY,
        adminRoleId,
        adminUserId,
      ),
    );
    adminToken = await login('invitations-admin', 'StrongP@ssw0rd');
    await signup('invitations-member');
    memberToken = await login('invitations-member', 'StrongP@ssw0rd');
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /admin/invitations — creates, sends the passcode, and answers through RocketsAuthInvitationResponseDto', async () => {
    const before = mockEmail.sendMail.mock.calls.length;
    const res = await request(app.getHttpServer())
      .post('/admin/invitations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'invitee@example.com', category: 'user' })
      .expect(201);

    const delivered = await nextEmail(before);
    expect(delivered.to).toBe('invitee@example.com');
    expect(res.body).toMatchObject({
      category: 'user',
      active: true,
    });
    expect(typeof res.body.code).toBe('string');
    expect(
      Object.keys(res.body).every((key) =>
        INVITATION_RESPONSE_KEYS.includes(key),
      ),
    ).toBe(true);
  });

  it('POST /admin/invitations/:code/reattempt — re-sends a fresh passcode', async () => {
    const { code, passcode: firstPasscode } = await invite(
      'reattempt@example.com',
    );
    const before = mockEmail.sendMail.mock.calls.length;

    await request(app.getHttpServer())
      .post(`/admin/invitations/${code}/reattempt`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    const resent = await nextEmail(before);
    expect(resent.to).toBe('reattempt@example.com');
    expect(resent.passcode).not.toBe(firstPasscode);

    await request(app.getHttpServer())
      .post('/admin/invitations/does-not-exist/reattempt')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });

  it('PATCH /invitation-acceptance/:code — activates the invited account with the supplied password', async () => {
    const { code, userId, passcode } = await invite('accepted@example.com');

    await request(app.getHttpServer())
      .patch(`/invitation-acceptance/${code}`)
      .send({ passcode, payload: { password: 'InvitedP@ssw0rd' } })
      .expect(200);

    await waitForOnboarding(userId);
    await login('accepted@example.com', 'InvitedP@ssw0rd');

    // Replaying the consumed passcode is refused before the invitation is
    // touched (400, not accepted).
    await request(app.getHttpServer())
      .patch(`/invitation-acceptance/${code}`)
      .send({ passcode, payload: { password: 'InvitedP@ssw0rd' } })
      .expect(400);

    // A fresh passcode for an already-accepted invitation is a 409, not a
    // 500 (upstream's InvitationAlreadyAcceptedException carries no HTTP
    // status).
    const sent = mockEmail.sendMail.mock.calls.length;
    await request(app.getHttpServer())
      .post(`/admin/invitations/${code}/reattempt`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    const fresh = await nextEmail(sent);
    const again = await request(app.getHttpServer())
      .patch(`/invitation-acceptance/${code}`)
      .send({
        passcode: fresh.passcode,
        payload: { password: 'InvitedP@ssw0rd' },
      })
      .expect(409);
    expect(again.body.errorCode).toBe(
      'ROCKETS_AUTH_INVITATION_ALREADY_ACCEPTED_ERROR',
    );
  });

  it('PATCH /invitation-acceptance/:code — validates the body before touching the invitation', async () => {
    const { code } = await invite('validated@example.com');
    const res = await request(app.getHttpServer())
      .patch(`/invitation-acceptance/${code}`)
      .send({ passcode: 123 })
      .expect(400);
    expect(res.body.errorCode).toBe('HTTP_BAD_REQUEST');
  });

  it('POST /admin/invitations/revoke — a revoked invitation can no longer be accepted', async () => {
    const { code, userId, passcode } = await invite('revoked@example.com');

    await request(app.getHttpServer())
      .post('/admin/invitations/revoke')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'revoked@example.com', category: 'user' })
      .expect(201);

    // Upstream clears the invitee's passcodes from a post-commit listener;
    // on SQLite's single connection that write must finish before the next
    // request opens its own.
    const otps = app.get<
      RepositoryInterface<{ assigneeId: string; active: boolean }>
    >(getDynamicRepositoryToken(USER_OTP_ENTITY_KEY));
    const deadline = Date.now() + 5_000;
    while (
      (await otps.find({})).some(
        (otp) => otp.assigneeId === userId && otp.active,
      )
    ) {
      if (Date.now() > deadline) throw new Error('passcode never cleared');
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    const res = await request(app.getHttpServer())
      .patch(`/invitation-acceptance/${code}`)
      .send({ passcode, payload: { password: 'InvitedP@ssw0rd' } });
    // Revocation burns the passcode (400) or, if a passcode survives, the
    // aggregate refuses (410) — never a 500.
    expect([400, 410]).toContain(res.status);
    expect(String(res.body.errorCode)).toMatch(/^ROCKETS_AUTH_INVITATION_/);
  });

  it('admin routes reject non-admin callers and anonymous requests', async () => {
    await request(app.getHttpServer())
      .post('/admin/invitations')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ email: 'nope@example.com', category: 'user' })
      .expect(403);
    await request(app.getHttpServer())
      .post('/admin/invitations/revoke')
      .send({ email: 'nope@example.com', category: 'user' })
      .expect(401);
  });
});
