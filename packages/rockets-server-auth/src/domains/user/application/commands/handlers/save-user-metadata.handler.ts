import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { TransactionScope } from '@concepta/rockets-core';

import { SaveUserMetadataCommand } from '../impl/save-user-metadata.command';
import { UserMetadataRepositoryInterface } from '../../../domain/repositories/user-metadata-repository.interface';
import { USER_METADATA_REPOSITORY_TOKEN } from '../../../domain/constants/user-domain.tokens';
import { RocketsAuthUserMetadataEntityInterface } from '../../../interfaces/rockets-auth-user-metadata-entity.interface';

@CommandHandler(SaveUserMetadataCommand)
export class SaveUserMetadataHandler
  implements
    ICommandHandler<
      SaveUserMetadataCommand,
      RocketsAuthUserMetadataEntityInterface
    >
{
  private readonly logger = new Logger(SaveUserMetadataHandler.name);

  constructor(
    @Inject(USER_METADATA_REPOSITORY_TOKEN)
    private readonly metadataRepository: UserMetadataRepositoryInterface,
    private readonly txScope: TransactionScope,
  ) {}

  async execute(
    command: SaveUserMetadataCommand,
  ): Promise<RocketsAuthUserMetadataEntityInterface> {
    const { ctx, userId, data } = command;

    return this.txScope.run(ctx, async (txCtx) => {
      this.logger.debug(`Creating/updating metadata for user ${userId}`);
      return this.metadataRepository.save(txCtx, userId, data);
    });
  }
}
