import { Injectable } from '@nestjs/common';
import { RepositoryInterface, Where } from '@concepta/nestjs-repository';
import { AbstractGetUserMetadataHandler } from './abstract-get-user-metadata.handler';
import { GetUserMetadataQuery } from '../impl/get-user-metadata.query';
import { UserMetadataEntityInterface } from '../../../domain/interfaces/user-metadata.interface';
import { USER_METADATA_MODULE_ENTITY_KEY } from '../../../rockets-core.constants';
import { InjectDynamicRepository } from '@bitwild/rockets-common';

@Injectable()
export class GetUserMetadataHandler extends AbstractGetUserMetadataHandler {
  constructor(
    @InjectDynamicRepository(USER_METADATA_MODULE_ENTITY_KEY)
    private readonly repo: RepositoryInterface<UserMetadataEntityInterface>,
  ) {
    super();
  }

  async execute(
    query: GetUserMetadataQuery,
  ): Promise<UserMetadataEntityInterface | null> {
    return this.repo.findOne({
      where: Where.eq<UserMetadataEntityInterface>('userId', query.userId),
    });
  }
}
