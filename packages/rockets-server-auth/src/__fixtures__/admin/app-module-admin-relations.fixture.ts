import { Global, Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AUTHENTICATION_MODULE_SETTINGS_TOKEN } from '@concepta/nestjs-authentication';

import { EventModule } from '@concepta/nestjs-event';
import { TypeOrmExtModule } from '@concepta/nestjs-typeorm-ext';
import { RepositoryModule } from '@concepta/nestjs-repository';
import { TypeOrmRepositoryModule } from '@concepta/nestjs-repository-typeorm';

import { ROCKETS_AUTH_OTP_ASSIGNMENT } from '../../shared/constants/rockets-auth.constants';
import { RocketsAuthModule } from '../../rockets-auth.module';
import { FederatedEntityFixture } from '../federated/federated.entity.fixture';
import { InvitationEntityFixture } from '../invitation/invitation.entity.fixture';
import { ormConfig } from '../ormconfig.fixture';
import { RoleEntityFixture } from '../role/role.entity.fixture';
import { UserRoleEntityFixture } from '../role/user-role.entity.fixture';
import { UserOtpEntityFixture } from '../user/user-otp-entity.fixture';
import { UserPasswordHistoryEntityFixture } from '../user/user-password-history.entity.fixture';
import { UserMetadataEntityFixture } from '../user/user-metadata.entity.fixture';
import { UserFixture } from '../user/user.entity.fixture';
import { UserCredentialEntityFixture } from '../user/user-credential.entity.fixture';

import { RocketsAuthUserCreateDtoFixture } from '../user/dto/rockets-auth-user-create.dto.fixture';
import { RocketsAuthUserUpdateDtoFixture } from '../user/dto/rockets-auth-user-update.dto.fixture';
import { RocketsAuthRoleDto } from '../../domains/role/dto/rockets-auth-role.dto';
import { RocketsAuthRoleUpdateDto } from '../../domains/role/dto/rockets-auth-role-update.dto';
import { RocketsAuthRoleCreateDto } from '../../domains/role';
import { RocketsAuthUserMetadataFixtureDto } from '../user/dto/rockets-auth-user-metadata.dto.fixture';
import { RocketsAuthUserFixtureDto } from '../user/dto/rockets-auth-user.dto.fixture';
import { ACServiceFixture } from './access-control.service.fixture';
import { acRulesFixture } from './app.acl.fixture';

@Global()
@Module({
  imports: [
    EventModule.forRoot({}),
    TypeOrmExtModule.forRootAsync({
      inject: [],
      useFactory: () => ({
        ...ormConfig,
        entities: [
          UserFixture,
          UserCredentialEntityFixture,
          UserMetadataEntityFixture,
          UserPasswordHistoryEntityFixture,
          UserOtpEntityFixture,
          FederatedEntityFixture,
          RoleEntityFixture,
          UserRoleEntityFixture,
          InvitationEntityFixture,
        ],
      }),
    }),
    TypeOrmModule.forFeature([
      UserFixture,
      UserCredentialEntityFixture,
      UserMetadataEntityFixture,
      UserRoleEntityFixture,
      RoleEntityFixture,
    ]),
    RocketsAuthModule.forRootAsync({
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
        entity: UserFixture,
        model: RocketsAuthUserFixtureDto,
        dto: {
          createOne: RocketsAuthUserCreateDtoFixture,
          updateOne: RocketsAuthUserUpdateDtoFixture,
        },
        userMetadataConfig: {
          imports: [TypeOrmModule.forFeature([UserMetadataEntityFixture])],
          entity: UserMetadataEntityFixture,
          createDto: RocketsAuthUserMetadataFixtureDto,
          updateDto: RocketsAuthUserMetadataFixtureDto,
        },
      },
      roleCrud: {
        imports: [TypeOrmModule.forFeature([RoleEntityFixture])],
        model: RocketsAuthRoleDto,
        dto: {
          createOne: RocketsAuthRoleCreateDto,
          updateOne: RocketsAuthRoleUpdateDto,
        },
      },
      enableGlobalJWTGuard: true,
      user: {
        imports: [TypeOrmModule.forFeature([UserCredentialEntityFixture])],
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
      },
      inject: [],
      useFactory: () => ({
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
        jwt: {
          settings: {
            access: { secret: 'test-secret' },
            refresh: { secret: 'test-secret' },
            default: { secret: 'test-secret' },
          },
        },
        services: { mailerService: { sendMail: () => Promise.resolve() } },
        accessControl: {
          service: new ACServiceFixture(),
          settings: {
            rules: acRulesFixture,
          },
        },
      }),
    }),
  ],
  providers: [
    Reflector,
    {
      provide: AUTHENTICATION_MODULE_SETTINGS_TOKEN,
      useValue: {},
    },
    ACServiceFixture,
  ],
  exports: [ACServiceFixture],
})
export class AppModuleAdminRelationsFixture {}
