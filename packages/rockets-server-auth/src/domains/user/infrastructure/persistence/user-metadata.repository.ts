import {
  InjectDynamicRepository,
  RepositoryInterface,
  RepositoryContextInterface,
  Where,
} from '@concepta/nestjs-repository';
import { Injectable } from '@nestjs/common';
import { DeepPartial } from '@concepta/nestjs-common';
import { UserMetadataRepositoryInterface } from '../../domain/repositories/user-metadata-repository.interface';
import { RocketsAuthUserMetadataEntityInterface } from '../../interfaces/rockets-auth-user-metadata-entity.interface';
import { RocketsAuthUserMetadataUpdatableInterface } from '../../interfaces/rockets-auth-user-metadata-updatable.interface';
import { USER_METADATA_MODULE_ENTITY_KEY } from '../config/user-metadata.constants';

@Injectable()
export class UserMetadataRepository implements UserMetadataRepositoryInterface {
  constructor(
    @InjectDynamicRepository(USER_METADATA_MODULE_ENTITY_KEY)
    private readonly repo: RepositoryInterface<RocketsAuthUserMetadataEntityInterface>,
  ) {}

  async findByUserId(
    ctx: RepositoryContextInterface,
    userId: string,
  ): Promise<RocketsAuthUserMetadataEntityInterface | null> {
    return this.repo.findOne({
      where: Where.eq<RocketsAuthUserMetadataEntityInterface>('userId', userId),
      ctx,
    });
  }

  async save(
    ctx: RepositoryContextInterface,
    userId: string,
    data: RocketsAuthUserMetadataUpdatableInterface,
  ): Promise<RocketsAuthUserMetadataEntityInterface> {
    return this.createOrUpdate(ctx, userId, data);
  }

  async createOrUpdate(
    ctx: RepositoryContextInterface,
    userId: string,
    data: RocketsAuthUserMetadataUpdatableInterface,
  ): Promise<RocketsAuthUserMetadataEntityInterface> {
    const existing = await this.findByUserId(ctx, userId);
    if (existing) {
      const definedData = Object.fromEntries(
        Object.entries(data).filter(([, v]) => v !== undefined),
      );
      return this.repo.update(
        existing,
        definedData as DeepPartial<RocketsAuthUserMetadataEntityInterface>,
        { ctx },
      );
    }
    return this.repo.create(
      {
        ...data,
        userId,
      } as DeepPartial<RocketsAuthUserMetadataEntityInterface>,
      { ctx },
    );
  }
}
