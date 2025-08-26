import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TypeOrmCrudAdapter } from '@concepta/nestjs-crud';
import { RocketsServerUserEntityInterface } from '../../interfaces/user/rockets-server-user-entity.interface';
import { UserFixture } from '../user/user.entity.fixture';

/**
 * Single reusable TypeORM CRUD adapter for admin user operations
 *
 * This adapter can be used for both listing users and individual user CRUD operations
 * It provides a unified interface for all admin user-related database operations
 */
export class AdminUserTypeOrmCrudAdapter extends TypeOrmCrudAdapter<RocketsServerUserEntityInterface> {
  constructor(
    @InjectRepository(UserFixture)
    private readonly repository: Repository<RocketsServerUserEntityInterface>,
  ) {
    super(repository);
  }
}
