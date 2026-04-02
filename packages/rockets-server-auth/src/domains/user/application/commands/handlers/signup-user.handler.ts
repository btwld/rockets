import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Injectable } from '@nestjs/common';
import {
  RepositoryContextInterface,
  TransactionScope,
} from '@concepta/nestjs-repository';
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
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id: _id, userId: _uid, ...safeMetadata } = dto.userMetadata;
        userMetadata = await this.commandBus.execute(
          new SaveUserMetadataCommand(userId, safeMetadata),
        );
      }

      await this.commandBus.execute(new AssignDefaultRoleCommand(userId));

      const plain = userAggregate.toPlain();
      return {
        ...plain,
        userMetadata,
      } as RocketsAuthUserEntityInterface;
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
