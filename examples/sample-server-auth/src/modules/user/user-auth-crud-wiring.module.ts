import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from './entities/user.entity';
import { UserMetadataEntity } from './entities/user-metadata.entity';

/**
 * TypeORM feature registration for RocketsAuth `userCrud` / `userMetadataConfig`.
 * Dynamic repository keys (`USER_CRUD_ENTITY_KEY`, etc.) are registered in `AppModule`.
 */
@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, UserMetadataEntity])],
  exports: [TypeOrmModule],
})
export class UserAuthCrudWiringModule {}
