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
import { TransactionScope } from '@concepta/nestjs-repository';

import { UpdateUserCommand } from '../impl/update-user.command';
import { RocketsAuthUserEntityInterface } from '../../../interfaces/rockets-auth-user-entity.interface';
import { RocketsAuthUserMetadataEntityInterface } from '../../../interfaces/rockets-auth-user-metadata-entity.interface';
import { SaveUserMetadataCommand } from '../impl/save-user-metadata.command';
import { GetUserMetadataQuery } from '../../queries/impl/get-user-metadata.query';
import { userAggregateToEntity } from '../../../../../shared/utils/aggregate-mappers';

@CommandHandler(UpdateUserCommand)
export class UpdateUserHandler implements ICommandHandler<UpdateUserCommand> {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly txScope: TransactionScope,
  ) {}

  // One OUTERMOST scope for the whole update: upstream's UpdateUserCommand
  // opens its own scope, and once an inner outermost scope commits, the
  // request context keeps the finished transaction — the metadata query
  // that follows would run on it and fail ("No active transaction"). With
  // this scope outermost, upstream's joins it as nested and everything
  // commits together (same seam as signup and recovery).
  async execute(
    command: UpdateUserCommand,
  ): Promise<RocketsAuthUserEntityInterface> {
    const { ctx, id, dto } = command;
    const { userMetadata, ...userData } = dto;
    const userId = String(id);

    return this.txScope.run(ctx, async (txCtx) => {
      const userAggregate = await this.commandBus.execute<
        UpstreamUpdateUserCommand,
        User
      >(new UpstreamUpdateUserCommand(txCtx, id, userData));

      let metadata: RocketsAuthUserEntityInterface['userMetadata'];
      if (userMetadata && Object.keys(userMetadata).length > 0) {
        metadata = await this.commandBus.execute(
          new SaveUserMetadataCommand(txCtx, userId, userMetadata),
        );
      } else {
        metadata =
          (await this.queryBus.execute<
            GetUserMetadataQuery,
            RocketsAuthUserMetadataEntityInterface | null
          >(new GetUserMetadataQuery(txCtx, userId))) ?? undefined;
      }

      return {
        ...userAggregateToEntity(userAggregate),
        userMetadata: metadata,
      };
    });
  }
}
