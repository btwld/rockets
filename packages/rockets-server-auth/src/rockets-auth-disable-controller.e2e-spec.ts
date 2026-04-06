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

describe('RocketsAuth disableController wiring (e2e)', () => {
  describe('disableController.password', () => {
    let app: INestApplication;

    beforeAll(async () => {
      const moduleFixture: TestingModule =
        await createRocketsAuthStandardE2eTestingModule({
          mockEmailService,
          rocketsAuthOverrides: {
            disableController: { password: true },
          },
        });

      app = moduleFixture.createNestApplication();
      applyRocketsAuthE2eAppGlobals(app);
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    it('does not register POST /token/password', async () => {
      await request(app.getHttpServer())
        .post('/token/password')
        .send({ username: 'x', password: 'y' })
        .expect(404);
    });
  });

  describe('disableController.otp', () => {
    let app: INestApplication;

    beforeAll(async () => {
      const moduleFixture: TestingModule =
        await createRocketsAuthStandardE2eTestingModule({
          mockEmailService,
          rocketsAuthOverrides: {
            disableController: { otp: true },
          },
        });

      app = moduleFixture.createNestApplication();
      applyRocketsAuthE2eAppGlobals(app);
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    it('does not register POST /otp', async () => {
      await request(app.getHttpServer())
        .post('/otp')
        .send({ email: 'a@b.com' })
        .expect(404);
    });
  });

  describe('disableController.mePassword', () => {
    let app: INestApplication;

    beforeAll(async () => {
      const moduleFixture: TestingModule =
        await createRocketsAuthStandardE2eTestingModule({
          mockEmailService,
          rocketsAuthOverrides: {
            disableController: { mePassword: true },
          },
        });

      app = moduleFixture.createNestApplication();
      applyRocketsAuthE2eAppGlobals(app);
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    it('does not register PATCH /me/password', async () => {
      await request(app.getHttpServer())
        .patch('/me/password')
        .set('Authorization', 'Bearer fake')
        .send({
          currentPassword: 'a',
          newPassword: 'bbbbbbbb',
        })
        .expect(404);
    });
  });
});
