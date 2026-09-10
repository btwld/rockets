import { Injectable, Logger, type PlainLiteralObject } from '@nestjs/common';

import { RepositoryInterface, Where } from '@concepta/nestjs-repository';
import { AbstractUpsertUserMetadataHandler } from './abstract-upsert-user-metadata.handler';
import { UpsertUserMetadataCommand } from '../impl/upsert-user-metadata.command';
import {
  UserMetadataEntityInterface,
  UserMetadataUpdatableInterface,
} from '../../../domain/interfaces/user-metadata.interface';
import {
  USER_METADATA_MANAGED_FIELDS,
  USER_METADATA_MODULE_ENTITY_KEY,
} from '../../../rockets-core.constants';
import { stripUndefined } from '../../../common';
import { InjectDynamicRepository } from '../../../common';

@Injectable()
export class UpsertUserMetadataHandler extends AbstractUpsertUserMetadataHandler {
  private readonly logger = new Logger(UpsertUserMetadataHandler.name);

  constructor(
    @InjectDynamicRepository(USER_METADATA_MODULE_ENTITY_KEY)
    private readonly repo: RepositoryInterface<UserMetadataEntityInterface>,
  ) {
    super();
  }

  async execute(
    command: UpsertUserMetadataCommand,
  ): Promise<UserMetadataEntityInterface> {
    const { ctx, userId, data } = command;
    this.logger.debug(`Upserting metadata for user ${userId}`);
    return this.upsert(ctx, userId, data);
  }

  // Every repository call forwards `ctx` (hooks on, inside the request's
  // transaction). `userId` is pinned from the caller on BOTH branches:
  // ownership never comes from the payload, whatever an app-supplied
  // update schema admits.
  //
  // The other server-owned columns are dropped for the same reason —
  // `id` above all, which `repo.update(existing, { id })` would turn into
  // a write against a row this user does not own. `validateRocketsUser`
  // `MetadataConfig` rejects an update schema that DECLARES one, but it
  // can only read a plain object shape: a union, an intersection or a
  // pipe passes that check with the field still admitted.
  private async upsert(
    ctx: PlainLiteralObject,
    userId: string,
    data: UserMetadataUpdatableInterface,
  ): Promise<UserMetadataEntityInterface> {
    const existing = await this.repo.findOne({
      where: Where.eq<UserMetadataEntityInterface>('userId', userId),
      ctx,
    });

    const owned = dropManagedFields(data);

    if (existing) {
      const definedData = stripUndefined(owned);
      return this.repo.update(
        existing,
        { ...definedData, userId } as Partial<UserMetadataEntityInterface>,
        { ctx },
      );
    }

    return this.repo.create(
      {
        ...owned,
        userId,
      } as Partial<UserMetadataEntityInterface>,
      { ctx },
    );
  }
}

function dropManagedFields(
  data: UserMetadataUpdatableInterface,
): UserMetadataUpdatableInterface {
  const out: Record<string, unknown> = { ...data };
  for (const field of USER_METADATA_MANAGED_FIELDS) {
    delete out[field];
  }
  return out as UserMetadataUpdatableInterface;
}
