import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CrudAdapter } from '@concepta/nestjs-crud';
import { RepositoryInterface } from '@concepta/nestjs-repository';
import { RocketsAuthUserMetadataEntityInterface } from '../../domains/user/interfaces/rockets-auth-user-metadata-entity.interface';
import { UserMetadataEntityFixture } from '../user/user-metadata.entity.fixture';

/**
 * TypeORM CRUD adapter fixture for user metadata.
 * CrudAdapter requires TypeORM Repository metadata for column introspection.
 */
@Injectable()
export class UserMetadataTypeOrmCrudAdapterFixture extends CrudAdapter<RocketsAuthUserMetadataEntityInterface> {
  constructor(
    @InjectRepository(UserMetadataEntityFixture)
    repository: Repository<RocketsAuthUserMetadataEntityInterface>,
  ) {
    super(
      repository as unknown as RepositoryInterface<RocketsAuthUserMetadataEntityInterface>,
    );
  }
}
