import { Injectable } from '@nestjs/common';
import { TypeOrmCrudAdapter } from '@concepta/nestjs-crud';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RocketsAuthUserEntityInterface } from '@bitwild/rockets-auth';
import { UserEntity } from '../entities/user.entity';

@Injectable()
export class UserTypeOrmCrudAdapter extends TypeOrmCrudAdapter<RocketsAuthUserEntityInterface> {
  constructor(
    @InjectRepository(UserEntity)
    private readonly repository: Repository<RocketsAuthUserEntityInterface>,
  ) {
    super(repository);
  }
}