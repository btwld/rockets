import type { AuthenticationStrategiesSettingsInterface } from '@concepta/nestjs-authentication';
import { EventModule } from '@concepta/nestjs-event';
import { TypeOrmRepositoryModule } from '@concepta/rockets-repository-typeorm';
import { DynamicModule, INestApplication, Type } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RocketsModule } from '@concepta/rockets';
import {
  RocketsCoreExceptionsFilter,
  type AuthBootstrap,
  type RocketsErrorSerializerInterface,
} from '@concepta/rockets-core';
import { ormConfig } from '../../__fixtures__/ormconfig.fixture';
import { InvitationEntityFixture } from '../../__fixtures__/invitation/invitation.entity.fixture';
import { UserOtpEntityFixture } from '../../__fixtures__/user/user-otp-entity.fixture';
import { UserFixture } from '../../__fixtures__/user/user.entity.fixture';
import { UserCredentialEntityFixture } from '../../__fixtures__/user/user-credential.entity.fixture';
import { FederatedEntityFixture } from '../../__fixtures__/federated/federated.entity.fixture';
import { RoleEntityFixture } from '../../__fixtures__/role/role.entity.fixture';
import { UserRoleEntityFixture } from '../../__fixtures__/role/user-role.entity.fixture';
import { UserMetadataEntityFixture } from '../../__fixtures__/user/user-metadata.entity.fixture';
import { UserPasswordHistoryEntityFixture } from '../../__fixtures__/user/user-password-history.entity.fixture';
import {
  rocketsAuthUserMetadataResponseSchema,
  rocketsAuthUserMetadataUpdateSchema,
} from '../../domains/user/infrastructure/schemas/rockets-auth-user-metadata.schema';
import { ROCKETS_AUTH_OTP_ASSIGNMENT } from '../../shared/constants/rockets-auth.constants';
import type { EmailSendInterface } from '../../shared/email/email-send.interfaces';
import { defineRocketsAuth } from '../../define-rockets-auth';
import type { DefineRocketsAuthInput } from '../../define-rockets-auth';
import {
  E2E_NOTIFICATION_HANDLERS,
  E2eSendPasswordUpdatedNotificationCommand,
  E2eSendRecoverLoginNotificationCommand,
  E2eSendRecoverPasswordNotificationCommand,
  E2eSendVerifyNotificationCommand,
} from '../../__fixtures__/notification/test-notification.fixture';

const typeOrmRootEntities = [
  UserFixture,
  UserCredentialEntityFixture,
  UserMetadataEntityFixture,
  UserPasswordHistoryEntityFixture,
  UserOtpEntityFixture,
  FederatedEntityFixture,
  RoleEntityFixture,
  UserRoleEntityFixture,
  InvitationEntityFixture,
] as const;

/**
 * Extras the e2e helper can splice into the factory return without each
 * test having to reproduce the full `useFactory` closure.
 */
export interface RocketsAuthE2eFactoryExtras {
  readonly userPasswordSettings?: {
    readonly reuseAfterDays?: number;
    readonly requireCurrent?: boolean;
  };
  readonly authenticationStrategies?: AuthenticationStrategiesSettingsInterface;
}

function defaultDefineRocketsAuthInput(
  mailerService: EmailSendInterface,
  extras: RocketsAuthE2eFactoryExtras = {},
): DefineRocketsAuthInput {
  return {
    useFactory: () => ({
      services: { mailerService },
      authentication: {
        ...(extras.authenticationStrategies
          ? { settings: { strategies: extras.authenticationStrategies } }
          : {}),
        ports: {
          recoveryNotification: {
            sendRecoverLoginNotificationCommand:
              E2eSendRecoverLoginNotificationCommand,
            sendRecoverPasswordNotificationCommand:
              E2eSendRecoverPasswordNotificationCommand,
            sendPasswordUpdatedNotificationCommand:
              E2eSendPasswordUpdatedNotificationCommand,
          },
          verifyNotification: {
            sendVerifyNotificationCommand: E2eSendVerifyNotificationCommand,
          },
        },
      },
      ...(extras.userPasswordSettings
        ? {
            user: {
              settings: { password: { ...extras.userPasswordSettings } },
            },
          }
        : {}),
      settings: {
        role: { adminRoleName: 'admin' },
        email: {
          from: 'test@test.com',
          baseUrl: 'http://localhost',
          templates: {
            sendOtp: { fileName: 'otp.hbs', subject: 'OTP' },
            invitation: {
              logo: '',
              fileName: 'inv.hbs',
              subject: 'Invitation',
            },
            invitationAccepted: {
              logo: '',
              fileName: 'inv-acc.hbs',
              subject: 'Accepted',
            },
          },
        },
        otp: {
          assignment: ROCKETS_AUTH_OTP_ASSIGNMENT,
          category: 'test',
          type: 'uuid',
          expiresIn: '1h',
        },
      },
    }),
    inject: [],
    persistence: {
      module: TypeOrmRepositoryModule,
      entities: {
        user: UserFixture,
        userCredentials: UserCredentialEntityFixture,
        userOtp: UserOtpEntityFixture,
        role: RoleEntityFixture,
        userRole: UserRoleEntityFixture,
        federatedIdentity: FederatedEntityFixture,
      },
    },
    userMetadata: {
      entity: UserMetadataEntityFixture,
      updateSchema: rocketsAuthUserMetadataUpdateSchema,
      responseSchema: rocketsAuthUserMetadataResponseSchema,
    },
    // `model` / `dto` are derived by the signup and admin modules from the
    // userMetadata schemas above.
    userCrud: {
      imports: [
        TypeOrmModule.forFeature([UserFixture, UserMetadataEntityFixture]),
      ],
    },
    invitationEntity: InvitationEntityFixture,
    invitation: {},
    user: {
      imports: [TypeOrmModule.forFeature([UserCredentialEntityFixture])],
    },
    role: {
      imports: [
        TypeOrmModule.forFeature([RoleEntityFixture, UserRoleEntityFixture]),
      ],
    },
  };
}

export interface CreateRocketsAuthStandardE2eModuleOptions {
  readonly mockEmailService: EmailSendInterface;
  /** Extra Nest controllers (e.g. JWT-protected test route). */
  readonly extraControllers?: Type[];
  /**
   * Shallow merge into `defineRocketsAuth` input (e.g. `disableController`).
   */
  readonly rocketsAuthOverrides?: Partial<DefineRocketsAuthInput>;
  /**
   * Per-test tweaks to the default `useFactory` return without rewriting it.
   * Add focused knobs as tests need them.
   */
  readonly factoryExtras?: RocketsAuthE2eFactoryExtras;
  /** Credential-only adapters appended after the built-in identity owner. */
  readonly additionalAuth?: ReadonlyArray<AuthBootstrap>;
  /**
   * Modules imported BEFORE the Rockets registration, for a test that
   * needs to compete with it (an app module providing one of core's
   * tokens, say).
   */
  readonly importsBefore?: DynamicModule['imports'];
  /** Modules imported AFTER the Rockets registration. */
  readonly importsAfter?: DynamicModule['imports'];
}

/**
 * Shared TypeORM + {@link RocketsModule} + {@link defineRocketsAuth} wiring
 * for package e2e tests.
 */
export async function createRocketsAuthStandardE2eTestingModule(
  options: CreateRocketsAuthStandardE2eModuleOptions,
): Promise<TestingModule> {
  const {
    mockEmailService,
    extraControllers = [],
    rocketsAuthOverrides,
    factoryExtras,
    additionalAuth = [],
    importsBefore = [],
    importsAfter = [],
  } = options;

  const baseInput = defaultDefineRocketsAuthInput(
    mockEmailService,
    factoryExtras,
  );
  const mergedInput: DefineRocketsAuthInput = {
    ...baseInput,
    ...rocketsAuthOverrides,
    disableController: {
      ...baseInput.disableController,
      ...rocketsAuthOverrides?.disableController,
    },
  };

  const rocketsAuth = defineRocketsAuth(mergedInput);

  const imports: DynamicModule['imports'] = [
    ...importsBefore,
    EventModule.forRoot({}),
    TypeOrmModule.forRootAsync({
      inject: [],
      useFactory: () => ({
        ...ormConfig,
        entities: [...typeOrmRootEntities],
      }),
    }),
    TypeOrmModule.forFeature([
      UserFixture,
      UserCredentialEntityFixture,
      UserMetadataEntityFixture,
      UserRoleEntityFixture,
      RoleEntityFixture,
    ]),
    RocketsModule.forRoot({
      auth:
        additionalAuth.length > 0
          ? [rocketsAuth, ...additionalAuth]
          : rocketsAuth,
    }),
    ...importsAfter,
  ];

  return Test.createTestingModule({
    imports,
    controllers: extraControllers,
    providers: [...E2E_NOTIFICATION_HANDLERS],
  }).compile();
}

export function applyRocketsAuthE2eAppGlobals(
  app: INestApplication,
  serializer?: RocketsErrorSerializerInterface,
): void {
  const httpAdapterHost = app.get(HttpAdapterHost);
  app.useGlobalFilters(
    new RocketsCoreExceptionsFilter(httpAdapterHost, serializer),
  );
}
