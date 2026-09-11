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
import {
  INVITATION_USER_ONBOARDING_SERVICE_TOKEN,
  type InvitationUserOnboardingServiceInterface,
} from '../application/services/invitation-user-onboarding.service';

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
   * Activation and the password are written inside the acceptance
   * transaction, so both are already durable when the route answers — no
   * polling. They used to be applied by a post-commit listener, which is
   * what made this a wait loop.
   *
   * This is NOT the regression guard: move onboarding back off the
   * transaction and this one FLAKES rather than failing. The rollback test
   * below is the deterministic one — so do not "fix" a flake here by
   * restoring the wait loop.
   */
  async function expectOnboarded(userId: string): Promise<void> {
    const credentials = app.get<
      RepositoryInterface<{ userId: string; active: boolean }>
    >(getDynamicRepositoryToken(USER_CREDENTIALS_ENTITY_KEY));
    const user = await request(app.getHttpServer())
      .get(`/admin/users/${userId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(user.body.active).toBe(true);
    const rows = await credentials.find({});
    expect(rows.some((row) => row.userId === userId && row.active)).toBe(true);
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
    const sentBeforeAcceptance = mockEmail.sendMail.mock.calls.length;

    await request(app.getHttpServer())
      .patch(`/invitation-acceptance/${code}`)
      .send({ passcode, payload: { password: 'InvitedP@ssw0rd' } })
      .expect(200);

    await expectOnboarded(userId);
    await login('accepted@example.com', 'InvitedP@ssw0rd');

    // Upstream's own InvitationAcceptedListener still rides the commit
    // hook: the "accepted" mail must survive onboarding moving off the
    // event. It also pins the mailbox index the reattempt below counts from.
    const accepted = await nextEmail(sentBeforeAcceptance);
    expect(accepted.to).toBe('accepted@example.com');

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

  it('PATCH /invitation-acceptance/:code — a failed onboarding rolls the acceptance back', async () => {
    const { code, userId, passcode } = await invite('rollback@example.com');

    const onboarding = app.get<InvitationUserOnboardingServiceInterface>(
      INVITATION_USER_ONBOARDING_SERVICE_TOKEN,
    );
    const spy = vi
      .spyOn(onboarding, 'onAccepted')
      .mockRejectedValueOnce(new Error('onboarding exploded'));

    await request(app.getHttpServer())
      .patch(`/invitation-acceptance/${code}`)
      .send({ passcode, payload: { password: 'InvitedP@ssw0rd' } })
      .expect(500);

    spy.mockRestore();

    // Nothing was kept: the invitation is still pending, the account is
    // still inactive, and the passcode was never consumed — so the invitee
    // simply tries again. Before onboarding joined the acceptance
    // transaction this answered 2xx, burned the invitation, and left the
    // account unreachable.
    const stillInactive = await request(app.getHttpServer())
      .get(`/admin/users/${userId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(stillInactive.body.active).toBe(false);

    await request(app.getHttpServer())
      .patch(`/invitation-acceptance/${code}`)
      .send({ passcode, payload: { password: 'InvitedP@ssw0rd' } })
      .expect(200);

    await expectOnboarded(userId);
    await login('rollback@example.com', 'InvitedP@ssw0rd');
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
