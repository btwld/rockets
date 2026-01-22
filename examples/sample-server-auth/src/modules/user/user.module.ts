import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Reflector } from '@nestjs/core';
import { UserEntity } from './entities/user.entity';
import { UserOtpEntity } from './entities/user-otp.entity';
import { RoleEntity } from '../role/role.entity';
import { UserRoleEntity } from './entities/user-role.entity';
import { FederatedEntity } from './entities/federated.entity';
import { UserMetadataEntity } from './entities/user-metadata.entity';
import { UserTypeOrmCrudAdapter } from './adapters/user-typeorm-crud.adapter';
import { RocketsJwtAuthProvider } from '@bitwild/rockets-auth';
import { MockAuthProvider } from '../../mock-auth.provider';

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
  ],
  controllers: [],
  providers: [
    Reflector,
    UserTypeOrmCrudAdapter,
    RocketsJwtAuthProvider,
    MockAuthProvider,
  ],
  exports: [
    TypeOrmModule,
    Reflector,
    UserTypeOrmCrudAdapter,
    RocketsJwtAuthProvider,
    MockAuthProvider,
  ],
})
export class UserModule {}