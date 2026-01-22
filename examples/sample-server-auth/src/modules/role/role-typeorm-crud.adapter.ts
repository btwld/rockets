import { Repository } from 'typeorm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TypeOrmCrudAdapter } from '@concepta/nestjs-crud';
import { RocketsAuthRoleEntityInterface } from '@bitwild/rockets-auth';
import { RoleEntity } from './role.entity';

/**
 * Role TypeORM CRUD adapter
 */
@Injectable()
export class RoleTypeOrmCrudAdapter<
  T extends RocketsAuthRoleEntityInterface,
> extends TypeOrmCrudAdapter<T> {
  /**
   * Constructor
   *
   * @param roleRepo - instance of the role repository.
   */
  constructor(
    @InjectRepository(RoleEntity)
    roleRepo: Repository<T>,
  ) {
    super(roleRepo);
  }
}