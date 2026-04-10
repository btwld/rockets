import { Injectable, Logger } from '@nestjs/common';
import {
  InjectDynamicRepository,
  RepositoryInterface,
  Where,
} from '@bitwild/rockets-repository';
import { AbstractUpsertUserMetadataHandler } from './abstract-upsert-user-metadata.handler';
import { UpsertUserMetadataCommand } from '../impl/upsert-user-metadata.command';
import {
  UserMetadataEntityInterface,
  UserMetadataUpdatableInterface,
} from '../../../domain/interfaces/user-metadata.interface';
import { USER_METADATA_MODULE_ENTITY_KEY } from '../../../rockets-core.constants';

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
    const { userId, data } = command;
    this.logger.debug(`Upserting metadata for user ${userId}`);
    return this.upsert(userId, data);
  }

  private async upsert(
    userId: string,
    data: UserMetadataUpdatableInterface,
  ): Promise<UserMetadataEntityInterface> {
    const existing = await this.repo.findOne({
      where: Where.eq<UserMetadataEntityInterface>('userId', userId),
    });
    
    if (existing) {
      //TODO: improve this code
      const definedData = Object.fromEntries(
        Object.entries(data).filter(([, v]) => v !== undefined),
      );
      return this.repo.update(
        existing,
        definedData as Partial<UserMetadataEntityInterface>,
      );
    }

    return this.repo.create({
      ...data,
      userId,
    } as Partial<UserMetadataEntityInterface>);
  }
}
