import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { TransactionScope } from '@concepta/nestjs-repository';

import { SaveUserMetadataCommand } from '../impl/save-user-metadata.command';
import { UserMetadataRepositoryInterface } from '../../../domain/repositories/user-metadata-repository.interface';
import { USER_METADATA_REPOSITORY_TOKEN } from '../../../domain/constants/user-domain.tokens';
import { USER_METADATA_MODULE_ENTITY_KEY } from '../../../../../shared/constants/repository-entity-keys.constants';
import { RocketsAuthUserMetadataEntityInterface } from '../../../interfaces/rockets-auth-user-metadata-entity.interface';
import { createRepositoryContext } from '@bitwild/rockets-core';

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
    const { userId, data } = command;

    const metadataCtx = createRepositoryContext(
      USER_METADATA_MODULE_ENTITY_KEY,
    );

    return this.txScope.run(metadataCtx, async () => {
      this.logger.debug(`Creating/updating metadata for user ${userId}`);
      return this.metadataRepository.save(metadataCtx, userId, data);
    });
  }
}
