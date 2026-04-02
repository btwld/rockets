import {
  CommandBus,
  CommandHandler,
  ICommandHandler,
  QueryBus,
} from '@nestjs/cqrs';
import {
  UpdateUserCommand as UpstreamUpdateUserCommand,
  User,
} from '@concepta/nestjs-user';

import { UpdateUserCommand } from '../impl/update-user.command';
import { RocketsAuthUserEntityInterface } from '../../../interfaces/rockets-auth-user-entity.interface';
import { RocketsAuthUserMetadataEntityInterface } from '../../../interfaces/rockets-auth-user-metadata-entity.interface';
import { SaveUserMetadataCommand } from '../impl/save-user-metadata.command';
import { GetUserMetadataQuery } from '../../queries/impl/get-user-metadata.query';

@CommandHandler(UpdateUserCommand)
export class UpdateUserHandler implements ICommandHandler<UpdateUserCommand> {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  async execute(
    command: UpdateUserCommand,
  ): Promise<RocketsAuthUserEntityInterface> {
    const { ctx, id, dto } = command;
    const { userMetadata, ...userData } = dto;
    const userId = String(id);

    const userAggregate = await this.commandBus.execute<
      UpstreamUpdateUserCommand,
      User
    >(new UpstreamUpdateUserCommand(ctx, id, userData));

    const plain = userAggregate.toPlain();

    let metadata: RocketsAuthUserEntityInterface['userMetadata'];
    if (userMetadata && Object.keys(userMetadata).length > 0) {
      metadata = await this.commandBus.execute(
        new SaveUserMetadataCommand(userId, userMetadata),
      );
    } else {
      metadata =
        (await this.queryBus.execute<
          GetUserMetadataQuery,
          RocketsAuthUserMetadataEntityInterface | null
        >(new GetUserMetadataQuery(userId))) ?? undefined;
    }

    return {
      ...plain,
      userMetadata: metadata,
    } as RocketsAuthUserEntityInterface;
  }
}
