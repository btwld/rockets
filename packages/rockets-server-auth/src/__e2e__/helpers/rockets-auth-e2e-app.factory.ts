import './patch-crud-module-for-e2e.bootstrap';

import { ExceptionsFilter } from '@bitwild/rockets-app';
import { EmailSendInterface } from '@concepta/nestjs-common';
import { EventModule } from '@concepta/nestjs-event';
import { TypeOrmRepositoryModule } from '@bitwild/rockets-repository-typeorm';
import {
  DynamicModule,
  INestApplication,
  Module,
  Type,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RocketsModule } from '@bitwild/rockets';
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
import { RocketsAuthUserDto } from '../../domains/user/infrastructure/dto/rockets-auth-user.dto';
import { RocketsAuthUserMetadataDto } from '../../domains/user/infrastructure/dto/rockets-auth-user-metadata.dto';
import { RocketsAuthUserCreateDto } from '../../domains/user/infrastructure/dto/rockets-auth-user-create.dto';
import { RocketsAuthUserUpdateDto } from '../../domains/user/infrastructure/dto/rockets-auth-user-update.dto';
import { ROCKETS_AUTH_OTP_ASSIGNMENT } from '../../shared/constants/rockets-auth.constants';
import {
  buildRocketsAuthResources,
  defineRocketsAuth,
} from '../../define-rockets-auth';
import type { DefineRocketsAuthInput } from '../../define-rockets-auth';
import {
  E2E_NOTIFICATION_HANDLERS,
  E2eSendPasswordUpdatedNotificationCommand,
  E2eSendRecoverLoginNotificationCommand,
  E2eSendRecoverPasswordNotificationCommand,
  E2eSendVerifyNotificationCommand,
} from '../../__fixtures__/notification/test-notification.fixture';

/** ConfigService stub used by several Rockets Auth e2e apps. */
@Module({
  providers: [
    {
      provide: ConfigService,
      useValue: {
        get: jest.fn().mockImplementation((key: string) => {
          if (key === 'jwt.secret') return 'test-secret';
          if (key === 'jwt.expiresIn') return '1h';
          return null;
        }),
      },
    },
  ],
  exports: [ConfigService],
})
export class RocketsAuthE2eMockConfigModule {}

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
 * test having to reproduce the full `useFactory` closure. Currently used
 * by `password-history.e2e-spec.ts` to enable the history check.
 */
export interface RocketsAuthE2eFactoryExtras {
  readonly userPasswordSettings?: {
    readonly reuseAfterDays?: number;
    readonly requireCurrent?: boolean;
  };
}

function defaultDefineRocketsAuthInput(
  mailerService: EmailSendInterface,
  extras: RocketsAuthE2eFactoryExtras = {},
): DefineRocketsAuthInput {
  return {
    useFactory: () => ({
      services: { mailerService },
      authentication: {
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
      createDto: RocketsAuthUserMetadataDto,
      updateDto: RocketsAuthUserMetadataDto,
    },
    userCrud: {
      imports: [
        TypeOrmModule.forFeature([UserFixture, UserMetadataEntityFixture]),
      ],
      model: RocketsAuthUserDto,
      dto: {
        createOne: RocketsAuthUserCreateDto,
        updateOne: RocketsAuthUserUpdateDto,
      },
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
   * Today only `userPasswordSettings` (for password-history tests). Add
   * more knobs as tests need them.
   */
  readonly factoryExtras?: RocketsAuthE2eFactoryExtras;
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
  const authResources = buildRocketsAuthResources(
    mergedInput.persistence,
    mergedInput.invitationEntity,
  );

  const imports: DynamicModule['imports'] = [
    RocketsAuthE2eMockConfigModule,
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
      auth: rocketsAuth,
      userMetadata: mergedInput.userMetadata,
      repository: TypeOrmRepositoryModule,
      resources: [...authResources],
    }),
  ];

  return Test.createTestingModule({
    imports,
    controllers: extraControllers,
    providers: [...E2E_NOTIFICATION_HANDLERS],
  }).compile();
}

export function applyRocketsAuthE2eAppGlobals(app: INestApplication): void {
  const exceptionsFilter = app.get(HttpAdapterHost);
  app.useGlobalFilters(new ExceptionsFilter(exceptionsFilter));
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidUnknownValues: true,
    }),
  );
}
