import { EmailSendInterface, ExceptionsFilter } from '@concepta/nestjs-common';
import { EventModule } from '@concepta/nestjs-event';
import { TypeOrmExtModule } from '@concepta/nestjs-typeorm-ext';
import { RepositoryModule } from '@concepta/nestjs-repository';
import { TypeOrmRepositoryModule } from '@concepta/nestjs-repository-typeorm';
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
import { ormConfig } from '../../__fixtures__/ormconfig.fixture';
import { InvitationEntityFixture } from '../../__fixtures__/invitation/invitation.entity.fixture';
import { UserOtpEntityFixture } from '../../__fixtures__/user/user-otp-entity.fixture';
import { UserFixture } from '../../__fixtures__/user/user.entity.fixture';
import { UserCredentialEntityFixture } from '../../__fixtures__/user/user-credential.entity.fixture';
import { FederatedEntityFixture } from '../../__fixtures__/federated/federated.entity.fixture';
import { RocketsAuthModule } from '../../rockets-auth.module';
import { RoleEntityFixture } from '../../__fixtures__/role/role.entity.fixture';
import { UserRoleEntityFixture } from '../../__fixtures__/role/user-role.entity.fixture';
import { UserMetadataEntityFixture } from '../../__fixtures__/user/user-metadata.entity.fixture';
import { UserPasswordHistoryEntityFixture } from '../../__fixtures__/user/user-password-history.entity.fixture';
import { RocketsAuthUserDto } from '../../domains/user/infrastructure/dto/rockets-auth-user.dto';
import { RocketsAuthUserMetadataDto } from '../../domains/user/infrastructure/dto/rockets-auth-user-metadata.dto';
import { RocketsAuthUserCreateDto } from '../../domains/user/infrastructure/dto/rockets-auth-user-create.dto';
import { RocketsAuthUserUpdateDto } from '../../domains/user/infrastructure/dto/rockets-auth-user-update.dto';
import { ROCKETS_AUTH_OTP_ASSIGNMENT } from '../../shared/constants/rockets-auth.constants';
import type { RocketsAuthOptionsInterface } from '../../shared/interfaces/rockets-auth-options.interface';
import type { RocketsAuthOptionsExtrasInterface } from '../../shared/interfaces/rockets-auth-options-extras.interface';

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

function defaultRocketsAuthForRoot(
  mailerService: EmailSendInterface,
): RocketsAuthOptionsInterface & RocketsAuthOptionsExtrasInterface {
  return {
    repositoryPersistence: {
      module: TypeOrmRepositoryModule,
      entities: {
        user: UserFixture,
        userCredentials: UserCredentialEntityFixture,
        userMetadata: UserMetadataEntityFixture,
        userOtp: UserOtpEntityFixture,
        role: RoleEntityFixture,
        userRole: UserRoleEntityFixture,
      },
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
      userMetadataConfig: {
        imports: [TypeOrmModule.forFeature([UserMetadataEntityFixture])],
        entity: UserMetadataEntityFixture,
        createDto: RocketsAuthUserMetadataDto,
        updateDto: RocketsAuthUserMetadataDto,
      },
    },
    jwt: {
      settings: {
        access: { secret: 'test-secret' },
        default: { secret: 'test-secret' },
        refresh: { secret: 'test-secret' },
      },
    },
    user: {
      imports: [TypeOrmModule.forFeature([UserCredentialEntityFixture])],
    },
    role: {
      imports: [
        TypeOrmModule.forFeature([RoleEntityFixture, UserRoleEntityFixture]),
      ],
    },
    federated: {
      imports: [
        TypeOrmExtModule.forFeature({
          federated: { entity: FederatedEntityFixture },
        }),
        RepositoryModule.forFeature({
          module: TypeOrmRepositoryModule,
          entities: [{ key: 'federated', entity: FederatedEntityFixture }],
        }),
      ],
    },
    invitation: {
      imports: [
        TypeOrmExtModule.forFeature({
          invitation: { entity: InvitationEntityFixture },
        }),
        RepositoryModule.forFeature({
          module: TypeOrmRepositoryModule,
          entities: [{ key: 'invitation', entity: InvitationEntityFixture }],
        }),
      ],
      userModelService: undefined as never,
    },
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
    services: { mailerService },
  };
}

export interface CreateRocketsAuthStandardE2eModuleOptions {
  readonly mockEmailService: EmailSendInterface;
  /** Extra Nest controllers (e.g. JWT-protected test route). */
  readonly extraControllers?: Type[];
  /**
   * Shallow merge into `RocketsAuthModule.forRoot` (e.g. `disableController`).
   * Nested objects such as `disableController` replace defaults unless you spread them yourself.
   */
  readonly rocketsAuthOverrides?: Partial<
    RocketsAuthOptionsInterface & RocketsAuthOptionsExtrasInterface
  >;
}

/**
 * Shared TypeORM + {@link RocketsAuthModule} wiring for package e2e tests
 * (same shape as the historical `rockets-auth.e2e-spec` bootstrap).
 */
export async function createRocketsAuthStandardE2eTestingModule(
  options: CreateRocketsAuthStandardE2eModuleOptions,
): Promise<TestingModule> {
  const { mockEmailService, extraControllers = [], rocketsAuthOverrides } =
    options;

  const baseRoot = defaultRocketsAuthForRoot(mockEmailService);
  const mergedRoot = {
    ...baseRoot,
    ...rocketsAuthOverrides,
    disableController: {
      ...baseRoot.disableController,
      ...rocketsAuthOverrides?.disableController,
    },
  };

  const imports: DynamicModule['imports'] = [
    RocketsAuthE2eMockConfigModule,
    EventModule.forRoot({}),
    TypeOrmExtModule.forRootAsync({
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
    RocketsAuthModule.forRoot(mergedRoot),
  ];

  return Test.createTestingModule({
    imports,
    controllers: extraControllers,
  }).compile();
}

export function applyRocketsAuthE2eAppGlobals(app: INestApplication): void {
  const exceptionsFilter = app.get(HttpAdapterHost);
  app.useGlobalFilters(new ExceptionsFilter(exceptionsFilter));
  app.useGlobalPipes(new ValidationPipe());
}
