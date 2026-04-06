import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { EmailSendInterface } from '@concepta/nestjs-common';

import {
  applyRocketsAuthE2eAppGlobals,
  createRocketsAuthStandardE2eTestingModule,
} from './__e2e__/helpers/rockets-auth-e2e-app.factory';
import { RocketsJwtAuthProvider } from './provider/rockets-jwt-auth.provider';
import { RocketsAuthCompatModule } from './shared/compat/rockets-auth-compat.module';
import {
  OtpServiceCompat,
  OTP_SERVICE_COMPAT_TOKEN,
} from './shared/compat/otp.service';
import {
  UserModelServiceCompat,
  UserModelServiceToken,
  UserPasswordServiceToken,
} from './shared/compat/user-model-service.compat';
import { RocketsAuthPortsModule } from './shared/ports/rockets-auth-ports.module';
import {
  RocketsAuthOtpPortService,
  ROCKETS_AUTH_OTP_PORT_TOKEN,
} from './shared/ports/rockets-auth-otp-port.service';
import {
  RocketsAuthUserPortService,
  ROCKETS_AUTH_USER_PORT_TOKEN,
  ROCKETS_AUTH_USER_PASSWORD_PORT_TOKEN,
} from './shared/ports/rockets-auth-user-port.service';
import { UserSignedUpEvent } from './domains/user/domain/events/user-signed-up.event';
import { UserUpdatedEvent } from './domains/user/domain/events/user-updated.event';
import {
  UserMetadataCannotBeDeletedException,
  UserMetadataException,
  UserMetadataNotFoundException,
  UserMetadataUnauthorizedAccessException,
} from './domains/user/domain/exceptions/user-metadata.exception';

const mockEmailService: EmailSendInterface = {
  sendMail: jest.fn().mockResolvedValue(undefined),
};

describe('Rockets auth — JWT provider, compat exports, domain surface (e2e)', () => {
  describe('Deprecated compat re-exports (shared/compat)', () => {
    it('RocketsAuthCompatModule is RocketsAuthPortsModule', () => {
      expect(RocketsAuthCompatModule).toBe(RocketsAuthPortsModule);
    });

    it('OTP compat tokens and class match ports implementation', () => {
      expect(OtpServiceCompat).toBe(RocketsAuthOtpPortService);
      expect(OTP_SERVICE_COMPAT_TOKEN).toBe(ROCKETS_AUTH_OTP_PORT_TOKEN);
    });

    it('User model compat tokens and class match ports implementation', () => {
      expect(UserModelServiceCompat).toBe(RocketsAuthUserPortService);
      expect(UserModelServiceToken).toBe(ROCKETS_AUTH_USER_PORT_TOKEN);
      expect(UserPasswordServiceToken).toBe(
        ROCKETS_AUTH_USER_PASSWORD_PORT_TOKEN,
      );
    });
  });

  describe('User domain events', () => {
    it('UserSignedUpEvent carries userId', () => {
      const event = new UserSignedUpEvent('user-evt-1');
      expect(event.userId).toBe('user-evt-1');
    });

    it('UserUpdatedEvent carries userId', () => {
      const event = new UserUpdatedEvent('user-evt-2');
      expect(event.userId).toBe('user-evt-2');
    });
  });

  describe('User metadata domain exceptions', () => {
    it('constructs hierarchy with stable error codes', () => {
      const base = new UserMetadataException('msg');
      expect(base.errorCode).toBe('USER_METADATA_ERROR');

      const notFound = new UserMetadataNotFoundException();
      expect(notFound.errorCode).toBe('USER_METADATA_NOT_FOUND_ERROR');

      const cannotDelete = new UserMetadataCannotBeDeletedException();
      expect(cannotDelete.errorCode).toBe(
        'USER_METADATA_CANNOT_BE_DELETED_ERROR',
      );

      const forbidden = new UserMetadataUnauthorizedAccessException();
      expect(forbidden.errorCode).toBe('USER_METADATA_UNAUTHORIZED_ACCESS_ERROR');
    });
  });

  describe('RocketsJwtAuthProvider.validateToken (integration)', () => {
    let app: INestApplication;
    let moduleFixture: TestingModule;

    beforeAll(async () => {
      moduleFixture = await createRocketsAuthStandardE2eTestingModule({
        mockEmailService,
      });
      app = moduleFixture.createNestApplication();
      applyRocketsAuthE2eAppGlobals(app);
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    it('resolves user and roles after password login', async () => {
      const username = 'jwtprov-e2e-user';
      await request(app.getHttpServer())
        .post('/signup')
        .send({
          username,
          email: `${username}@example.com`,
          password: 'Password123!',
          active: true,
        })
        .expect(201);

      const loginResponse = await request(app.getHttpServer())
        .post('/token/password')
        .send({ username, password: 'Password123!' })
        .expect(200);

      const accessToken: string = loginResponse.body.accessToken;
      expect(typeof accessToken).toBe('string');

      const provider = app.get(RocketsJwtAuthProvider);
      const authorized = await provider.validateToken(accessToken);

      expect(authorized.sub).toBeDefined();
      expect(authorized.email).toContain('@');
      expect(Array.isArray(authorized.userRoles)).toBe(true);
      expect(authorized.claims).toEqual(expect.any(Object));
    });

    it('maps invalid tokens to UnauthorizedException', async () => {
      const provider = app.get(RocketsJwtAuthProvider);
      await expect(provider.validateToken('not-a-jwt')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
