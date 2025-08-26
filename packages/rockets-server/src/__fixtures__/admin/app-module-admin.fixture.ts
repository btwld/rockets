import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TypeOrmExtModule } from '@concepta/nestjs-typeorm-ext';

import { RocketsServerModule } from '../../rockets-server.module';
import { FederatedEntityFixture } from '../federated/federated.entity.fixture';
import { ormConfig } from '../ormconfig.fixture';
import { RoleEntityFixture } from '../role/role.entity.fixture';
import { UserRoleEntityFixture } from '../role/user-role.entity.fixture';
import { UserOtpEntityFixture } from '../user/user-otp-entity.fixture';
import { UserPasswordHistoryEntityFixture } from '../user/user-password-history.entity.fixture';
import { UserProfileEntityFixture } from '../user/user-profile.entity.fixture';
import { UserFixture } from '../user/user.entity.fixture';

import { RocketsServerUserCreateDto } from '../../dto/user/rockets-server-user-create.dto';
import { RocketsServerUserUpdateDto } from '../../dto/user/rockets-server-user-update.dto';
import { RocketsServerUserDto } from '../../dto/user/rockets-server-user.dto';
import { AdminUserTypeOrmCrudAdapter } from './admin-user-crud.adapter';

@Global()
@Module({
  imports: [
    // TypeORM datasource
    TypeOrmModule.forRoot({
      ...ormConfig,
      entities: [
        UserFixture,
        UserProfileEntityFixture,
        UserPasswordHistoryEntityFixture,
        UserOtpEntityFixture,
        FederatedEntityFixture,
        RoleEntityFixture,
        UserRoleEntityFixture,
      ],
    }),
    // Dynamic repos for feature modules
    TypeOrmExtModule.forRootAsync({
      inject: [],
      useFactory: () => {
        return {
          ...ormConfig,
          entities: [
            UserFixture,
            UserOtpEntityFixture,
            UserPasswordHistoryEntityFixture,
            UserProfileEntityFixture,
            FederatedEntityFixture,
            UserRoleEntityFixture,
            RoleEntityFixture,
          ],
        };
      },
    }),
    TypeOrmExtModule.forFeature({
      user: { entity: UserFixture },
      role: { entity: RoleEntityFixture },
      userRole: { entity: UserRoleEntityFixture },
      userOtp: { entity: UserOtpEntityFixture },
      federated: { entity: FederatedEntityFixture },
    }),
    TypeOrmModule.forFeature([UserFixture]),
    RocketsServerModule.forRootAsync({
      userCrud: {
        imports: [TypeOrmModule.forFeature([UserFixture])],
        // entity: UserFixture,
        adapter: AdminUserTypeOrmCrudAdapter,
        model: RocketsServerUserDto,
        dto: {
          createOne: RocketsServerUserCreateDto,
          updateOne: RocketsServerUserUpdateDto,
        },
      },
      useFactory: () => ({
        jwt: {
          settings: {
            access: { secret: 'test-secret' },
            refresh: { secret: 'test-secret' },
            default: { secret: 'test-secret' },
          },
        },
        services: {
          mailerService: { sendMail: () => Promise.resolve() },
        },
      }),
    }),
  ],
  providers: [],
  exports: [],
})
export class AppModuleAdminFixture {}
