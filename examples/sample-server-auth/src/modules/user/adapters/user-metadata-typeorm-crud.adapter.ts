import { Injectable } from '@nestjs/common';
import { CrudAdapter, TypeOrmCrudAdapter } from '@concepta/nestjs-crud';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserMetadataEntity } from '../entities/user-metadata.entity';
import { RocketsAuthUserMetadataEntityInterface } from '@bitwild/rockets-auth';

@Injectable()
export class UserMetadataTypeOrmCrudAdapter
  extends TypeOrmCrudAdapter<RocketsAuthUserMetadataEntityInterface>
  implements CrudAdapter<RocketsAuthUserMetadataEntityInterface>
{
  constructor(
    @InjectRepository(UserMetadataEntity)
    private readonly repository: Repository<RocketsAuthUserMetadataEntityInterface>,
  ) {
    super(repository);
  }
}


