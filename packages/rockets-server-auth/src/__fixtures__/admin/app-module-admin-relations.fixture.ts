import { Global, Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AUTHENTICATION_MODULE_SETTINGS_TOKEN } from '@concepta/nestjs-authentication';

import { EventModule } from '@concepta/nestjs-event';
import { TypeOrmExtModule } from '@concepta/nestjs-typeorm-ext';

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

import { RocketsAuthUserCreateDto } from '../../domains/user/dto/rockets-auth-user-create.dto';
import { RocketsAuthUserUpdateDto } from '../../domains/user/dto/rockets-auth-user-update.dto';
import { AdminUserTypeOrmCrudAdapter } from './admin-user-crud.adapter';
import { RocketsAuthRoleDto } from '../../domains/role/dto/rockets-auth-role.dto';
import { RocketsAuthRoleUpdateDto } from '../../domains/role/dto/rockets-auth-role-update.dto';
import { RoleTypeOrmCrudAdapter } from '../role/role-typeorm-crud.adapter';
import { RocketsAuthRoleCreateDto } from '../../domains/role';
import { UserMetadataTypeOrmCrudAdapterFixture as UserMetadataAdapter } from '../services/user-metadata-typeorm-crud.adapter.fixture';
import { RocketsAuthUserMetadataFixtureDto } from '../user/dto/rockets-auth-user-metadata.dto.fixture';
import { RocketsAuthUserFixtureDto } from '../user/dto/rockets-auth-user.dto.fixture';
import { ACServiceFixture } from './access-control.service.fixture';
import { acRulesFixture } from './app.acl.fixture';

@Global()
@Module({
  imports: [
    EventModule.forRoot({}),
    TypeOrmModule.forRoot({
      ...ormConfig,
      entities: [
        UserFixture,
        UserMetadataEntityFixture,
        UserPasswordHistoryEntityFixture,
        UserOtpEntityFixture,
        FederatedEntityFixture,
        RoleEntityFixture,
        UserRoleEntityFixture,
        InvitationEntityFixture,
      ],
    }),
    TypeOrmExtModule.forRootAsync({
      inject: [],
      useFactory: () => ({
        ...ormConfig,
        entities: [
          UserFixture,
          UserOtpEntityFixture,
          UserPasswordHistoryEntityFixture,
          UserMetadataEntityFixture,
          FederatedEntityFixture,
          UserRoleEntityFixture,
          RoleEntityFixture,
          InvitationEntityFixture,
        ],
      }),
    }),
    TypeOrmExtModule.forFeature({
      user: { entity: UserFixture },
      role: { entity: RoleEntityFixture },
      userRole: { entity: UserRoleEntityFixture },
      userOtp: { entity: UserOtpEntityFixture },
      federated: { entity: FederatedEntityFixture },
      invitation: { entity: InvitationEntityFixture },
    }),
    TypeOrmModule.forFeature([
      UserFixture,
      RoleEntityFixture,
      UserMetadataEntityFixture,
    ]),
    RocketsAuthModule.forRootAsync({
      userCrud: {
        imports: [
          TypeOrmModule.forFeature([UserFixture, UserMetadataEntityFixture]),
        ],
        adapter: AdminUserTypeOrmCrudAdapter,
        model: RocketsAuthUserFixtureDto,
        dto: {
          createOne: RocketsAuthUserCreateDto,
          updateOne: RocketsAuthUserUpdateDto,
        },
        userMetadataConfig: {
          imports: [TypeOrmModule.forFeature([UserMetadataEntityFixture])],
          adapter: UserMetadataAdapter,
          entity: UserMetadataEntityFixture,
          createDto: RocketsAuthUserMetadataFixtureDto,
          updateDto: RocketsAuthUserMetadataFixtureDto,
        },
      },
      roleCrud: {
        imports: [TypeOrmModule.forFeature([RoleEntityFixture])],
        adapter: RoleTypeOrmCrudAdapter,
        model: RocketsAuthRoleDto,
        dto: {
          createOne: RocketsAuthRoleCreateDto,
          updateOne: RocketsAuthRoleUpdateDto,
        },
      },
      enableGlobalJWTGuard: true,
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
            assignment: 'userOtp' as const,
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
