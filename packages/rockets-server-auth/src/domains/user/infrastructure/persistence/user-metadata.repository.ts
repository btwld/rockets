import { RepositoryInterface, Where } from '@concepta/nestjs-repository';

import { Injectable } from '@nestjs/common';
import { DeepPartial } from '@concepta/nestjs-core';
import { UserMetadataRepositoryInterface } from '../../domain/repositories/user-metadata-repository.interface';
import { RocketsAuthUserMetadataEntityInterface } from '../../interfaces/rockets-auth-user-metadata-entity.interface';
import { RocketsAuthUserMetadataUpdatableInterface } from '../../interfaces/rockets-auth-user-metadata-updatable.interface';
import { USER_METADATA_MODULE_ENTITY_KEY } from '../../../../shared/constants/repository-entity-keys.constants';
import { RepositoryContextInterface } from '@bitwild/rockets-core';
import { InjectDynamicRepository } from '@bitwild/rockets-core';

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
      return this.repo.update(existing, dropUndefined(data), { ctx });
    }
    return this.repo.create({ ...data, userId }, { ctx });
  }
}

/**
 * Strip `undefined` values from a partial entity payload while preserving
 * the typed `DeepPartial<T>` shape.
 */
function dropUndefined<T extends object>(input: T): DeepPartial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(input) as (keyof T)[]) {
    const value = input[key];
    if (value !== undefined) {
      out[key] = value;
    }
  }
  return out as DeepPartial<T>;
}
