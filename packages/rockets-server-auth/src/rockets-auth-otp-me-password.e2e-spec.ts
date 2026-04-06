import { EmailSendInterface } from '@concepta/nestjs-common';
import { INestApplication } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import {
  applyRocketsAuthE2eAppGlobals,
  createRocketsAuthStandardE2eTestingModule,
} from './__e2e__/helpers/rockets-auth-e2e-app.factory';

const mockEmailService: EmailSendInterface = {
  sendMail: jest.fn().mockResolvedValue(undefined),
};

describe('RocketsAuth OTP + Me password (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule =
      await createRocketsAuthStandardE2eTestingModule({
        mockEmailService,
      });

    app = moduleFixture.createNestApplication();
    applyRocketsAuthE2eAppGlobals(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const signup = async (username: string) => {
    await request(app.getHttpServer())
      .post('/signup')
      .send({
        username,
        email: `${username}@example.com`,
        password: 'Password123!',
        active: true,
      })
      .expect(201);
  };

  const login = async (username: string, password: string) => {
    const res = await request(app.getHttpServer())
      .post('/token/password')
      .send({ username, password })
      .expect(200);
    return res.body as { accessToken: string; refreshToken: string };
  };

  describe('RocketsAuthOtpController', () => {
    it('POST /otp returns 200 for registered user and sends email with passcode', async () => {
      const u = `otp-user-${Date.now()}`;
      await signup(u);

      await request(app.getHttpServer())
        .post('/otp')
        .send({ email: `${u}@example.com` })
        .expect(201);

      expect(mockEmailService.sendMail).toHaveBeenCalled();
      const call = (mockEmailService.sendMail as jest.Mock).mock.calls[0][0] as {
        context?: { passcode?: string };
      };
      expect(call.context?.passcode).toBeDefined();
      expect(String(call.context?.passcode).length).toBeGreaterThan(0);
    });

    it('POST /otp returns 200 for unknown email without revealing absence', async () => {
      await request(app.getHttpServer())
        .post('/otp')
        .send({ email: 'nobody@example.com' })
        .expect(201);

      expect(mockEmailService.sendMail).not.toHaveBeenCalled();
    });

    it('POST /otp returns 400 for invalid email', async () => {
      await request(app.getHttpServer())
        .post('/otp')
        .send({ email: 'not-an-email' })
        .expect(400);
    });

    it('PATCH /otp returns JWT payload for valid passcode', async () => {
      const u = `otp-confirm-${Date.now()}`;
      await signup(u);
      const email = `${u}@example.com`;

      await request(app.getHttpServer()).post('/otp').send({ email }).expect(201);

      const call = (mockEmailService.sendMail as jest.Mock).mock.calls[0][0] as {
        context?: { passcode?: string };
      };
      const passcode = call.context?.passcode;
      expect(passcode).toBeDefined();

      const confirm = await request(app.getHttpServer())
        .patch('/otp')
        .send({ email, passcode })
        .expect(200);

      expect(confirm.body).toHaveProperty('accessToken');
      expect(confirm.body).toHaveProperty('refreshToken');
    });

    it('PATCH /otp returns 401 for wrong passcode', async () => {
      const u = `otp-bad-${Date.now()}`;
      await signup(u);
      const email = `${u}@example.com`;

      await request(app.getHttpServer()).post('/otp').send({ email }).expect(201);

      await request(app.getHttpServer())
        .patch('/otp')
        .send({ email, passcode: 'definitely-wrong-code' })
        .expect(401);
    });
  });

  describe('MePasswordController', () => {
    it('PATCH /me/password returns 401 without bearer token', async () => {
      await request(app.getHttpServer())
        .patch('/me/password')
        .send({
          currentPassword: 'Password123!',
          newPassword: 'NewPassword456!',
        })
        .expect(401);
    });

    it('PATCH /me/password returns 200 and allows login with new password', async () => {
      const u = `me-pwd-ok-${Date.now()}`;
      await signup(u);
      const { accessToken } = await login(u, 'Password123!');

      await request(app.getHttpServer())
        .patch('/me/password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: 'Password123!',
          newPassword: 'NewPassword456!',
        })
        .expect(200);

      await login(u, 'NewPassword456!');
    });
  });
});
