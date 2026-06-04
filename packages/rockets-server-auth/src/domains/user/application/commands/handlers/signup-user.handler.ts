import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Injectable } from '@nestjs/common';
import { TransactionScope } from '@bitwild/rockets-repository';
import { RepositoryContextInterface } from '@bitwild/rockets-app';
import {
  CreateUserCommand,
  GetUserByEmailQuery,
  GetUserByUsernameQuery,
} from '@concepta/nestjs-user';

import { SaveUserMetadataCommand } from '../impl/save-user-metadata.command';
import { AssignDefaultRoleCommand } from '../impl/assign-default-role.command';
import { DuplicateUserException } from '../../../domain/exceptions/user.exception';
import { RocketsAuthUserEntityInterface } from '../../../interfaces/rockets-auth-user-entity.interface';
import { AbstractSignupUserHandler } from './abstract-signup-user.handler';
import { SignupUserCommand } from '../impl/signup-user.command';
import { userAggregateToEntity } from '../../../../../shared/utils/aggregate-mappers';

/**
 * Drop server-controlled identity fields from a user-supplied metadata
 * payload. `id` and `userId` are owned by the persistence layer and must
 * not be settable via the signup body.
 */
function stripIdentityFields<T extends object>(metadata: T): Partial<T> {
  const copy: Partial<T> = { ...metadata };
  delete (copy as { id?: unknown }).id;
  delete (copy as { userId?: unknown }).userId;
  return copy;
}

@Injectable()
export class SignupUserHandler extends AbstractSignupUserHandler {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly txScope: TransactionScope,
  ) {
    super();
  }

  async execute(
    command: SignupUserCommand,
  ): Promise<RocketsAuthUserEntityInterface> {
    const { context, dto } = command;

    // Uniqueness check (read-only, before TX)
    await this.ensureUnique(context, dto.email, dto.username);

    return this.txScope.run(context, async () => {
      const userAggregate = await this.commandBus.execute(
        new CreateUserCommand(context, {
          email: dto.email,
          username: dto.username,
          active: dto.active ?? true,
          password: dto.password,
        }),
      );

      const userId: string = userAggregate.id;

      let userMetadata: RocketsAuthUserEntityInterface['userMetadata'];
      if (dto.userMetadata) {
        userMetadata = await this.commandBus.execute(
          new SaveUserMetadataCommand(
            userId,
            stripIdentityFields(dto.userMetadata),
          ),
        );
      }

      await this.commandBus.execute(new AssignDefaultRoleCommand(userId));

      return {
        ...userAggregateToEntity(userAggregate),
        userMetadata,
      };
    });
  }

  private async ensureUnique(
    ctx: RepositoryContextInterface,
    email: string,
    username: string,
  ): Promise<void> {
    const [byEmail, byUsername] = await Promise.all([
      this.queryBus.execute(new GetUserByEmailQuery(ctx, email)),
      this.queryBus.execute(new GetUserByUsernameQuery(ctx, username)),
    ]);

    if (byEmail || byUsername) throw new DuplicateUserException();
  }
}
