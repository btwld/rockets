import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Reflector } from '@nestjs/core';
import { UserEntity } from './entities/user.entity';
import { UserOtpEntity } from './entities/user-otp.entity';
import { RoleEntity } from '../role/role.entity';
import { UserRoleEntity } from './entities/user-role.entity';
import { FederatedEntity } from './entities/federated.entity';
import { UserMetadataEntity } from './entities/user-metadata.entity';
import { RocketsJwtAuthAdapter } from '@bitwild/rockets-auth';
import { MockAuthAdapter } from '../../mock-auth.adapter';
import { UserAuthCrudWiringModule } from './user-auth-crud-wiring.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      UserOtpEntity,
      RoleEntity,
      UserRoleEntity,
      FederatedEntity,
      UserMetadataEntity,
    ]),
    UserAuthCrudWiringModule,
  ],
  controllers: [],
  providers: [Reflector, RocketsJwtAuthAdapter, MockAuthAdapter],
  exports: [
    TypeOrmModule,
    UserAuthCrudWiringModule,
    Reflector,
    RocketsJwtAuthAdapter,
    MockAuthAdapter,
  ],
})
export class UserModule {}
