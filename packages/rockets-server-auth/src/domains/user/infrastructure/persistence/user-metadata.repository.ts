import { RepositoryInterface, Where } from '@concepta/nestjs-repository';

import { Injectable } from '@nestjs/common';
import { DeepPartial } from '@concepta/nestjs-core';
import { UserMetadataRepositoryInterface } from '../../domain/repositories/user-metadata-repository.interface';
import { RocketsAuthUserMetadataEntityInterface } from '../../interfaces/rockets-auth-user-metadata-entity.interface';
import { RocketsAuthUserMetadataUpdatableInterface } from '../../interfaces/rockets-auth-user-metadata-updatable.interface';
import { USER_METADATA_MODULE_ENTITY_KEY } from '../../../../shared/constants/repository-entity-keys.constants';
import type { PlainLiteralObject } from '@nestjs/common';
import {
  InjectDynamicRepository,
  USER_METADATA_MANAGED_FIELDS,
} from '@concepta/rockets-core';

@Injectable()
export class UserMetadataRepository implements UserMetadataRepositoryInterface {
  constructor(
    @InjectDynamicRepository(USER_METADATA_MODULE_ENTITY_KEY)
    private readonly repo: RepositoryInterface<RocketsAuthUserMetadataEntityInterface>,
  ) {}

  async findByUserId(
    ctx: PlainLiteralObject,
    userId: string,
  ): Promise<RocketsAuthUserMetadataEntityInterface | null> {
    return this.repo.findOne({
      where: Where.eq<RocketsAuthUserMetadataEntityInterface>('userId', userId),
      ctx,
    });
  }

  async save(
    ctx: PlainLiteralObject,
    userId: string,
    data: RocketsAuthUserMetadataUpdatableInterface,
  ): Promise<RocketsAuthUserMetadataEntityInterface> {
    return this.createOrUpdate(ctx, userId, data);
  }

  async createOrUpdate(
    ctx: PlainLiteralObject,
    userId: string,
    data: RocketsAuthUserMetadataUpdatableInterface,
  ): Promise<RocketsAuthUserMetadataEntityInterface> {
    const existing = await this.findByUserId(ctx, userId);
    // `userId` is pinned on BOTH branches: ownership comes from the caller,
    // never from the payload, whatever an app-supplied update schema admits.
    // The rest of the server-owned columns are dropped for the same reason
    // — an `id` in the payload would send `repo.update` at another row.
    const owned = dropManagedFields(data);
    if (existing) {
      return this.repo.update(
        existing,
        { ...dropUndefined(owned), userId },
        { ctx },
      );
    }
    return this.repo.create({ ...owned, userId }, { ctx });
  }
}

function dropManagedFields(
  data: RocketsAuthUserMetadataUpdatableInterface,
): RocketsAuthUserMetadataUpdatableInterface {
  const out: Record<string, unknown> = { ...data };
  for (const field of USER_METADATA_MANAGED_FIELDS) {
    delete out[field];
  }
  return out as RocketsAuthUserMetadataUpdatableInterface;
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
