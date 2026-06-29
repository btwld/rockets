import { Injectable } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ReferenceIdInterface, ReferenceSubject } from '@concepta/nestjs-core';
import {
  UserInterface,
  UserEntityInterface,
  UserCredentialEntityInterface,
} from '@concepta/nestjs-user';
import { DomainAggregate } from '@concepta/nestjs-core/aggregate';
import { userAggregateToEntity } from '../utils/aggregate-mappers';
import { RocketsGetUserByEmailQuery } from '../../domains/user/application/queries/impl/rockets-get-user-by-email.query';
import { RocketsGetUserByUsernameQuery } from '../../domains/user/application/queries/impl/rockets-get-user-by-username.query';
import { RocketsGetUserBySubjectQuery } from '../../domains/user/application/queries/impl/rockets-get-user-by-subject.query';
import { RocketsGetUserByIdQuery } from '../../domains/user/application/queries/impl/rockets-get-user-by-id.query';
import { RocketsCreateUserCommand } from '../../domains/user/application/commands/impl/rockets-create-user.command';
import { RocketsUpdateUserCommand } from '../../domains/user/application/commands/impl/rockets-update-user.command';
import { GetActiveCredentialQuery } from '../../domains/user/application/queries/impl/get-active-credential.query';

export const ROCKETS_AUTH_USER_PORT_TOKEN = Symbol(
  '__ROCKETS_AUTH_USER_PORT__',
);

/** User with optional credential fields for auth-local compatibility. */
interface UserWithCredentials extends UserEntityInterface {
  passwordHash?: string | null;
}

@Injectable()
export class RocketsAuthUserPortService {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
  ) {}

  async bySubject(
    subject: ReferenceSubject,
  ): Promise<ReferenceIdInterface | null> {
    const result = await this.queryBus.execute<
      RocketsGetUserBySubjectQuery,
      DomainAggregate<UserInterface> | ReferenceIdInterface | null
    >(new RocketsGetUserBySubjectQuery({}, subject));
    if (!result) return null;
    return 'id' in result ? { id: result.id } : null;
  }

  async byId(id: string): Promise<UserEntityInterface | null> {
    const result = await this.queryBus.execute<
      RocketsGetUserByIdQuery,
      DomainAggregate<UserInterface> | null
    >(new RocketsGetUserByIdQuery(id));
    return result ? userAggregateToEntity(result) : null;
  }

  async byEmail(email: string): Promise<UserWithCredentials | null> {
    const result = await this.queryBus.execute<
      RocketsGetUserByEmailQuery,
      DomainAggregate<UserInterface> | null
    >(new RocketsGetUserByEmailQuery(email));
    if (!result) return null;
    return this.enrichWithCredentials(result);
  }

  async byUsername(username: string): Promise<UserWithCredentials | null> {
    const result = await this.queryBus.execute<
      RocketsGetUserByUsernameQuery,
      DomainAggregate<UserInterface> | null
    >(new RocketsGetUserByUsernameQuery(username));
    if (!result) return null;
    return this.enrichWithCredentials(result);
  }

  async update(
    data: Partial<UserEntityInterface> & { id: string },
  ): Promise<UserEntityInterface | null> {
    const result = await this.commandBus.execute<
      RocketsUpdateUserCommand,
      DomainAggregate<UserInterface> | null
    >(new RocketsUpdateUserCommand(data.id, data));
    return result ? userAggregateToEntity(result) : null;
  }

  async create(
    data: Partial<UserEntityInterface>,
  ): Promise<UserEntityInterface | null> {
    const result = await this.commandBus.execute<
      RocketsCreateUserCommand,
      DomainAggregate<UserInterface> | null
    >(new RocketsCreateUserCommand(data));
    return result ? userAggregateToEntity(result) : null;
  }

  /** auth-local expects passwordHash/passwordSalt on the user object. */
  private async enrichWithCredentials(
    userAggregate: DomainAggregate<UserInterface>,
  ): Promise<UserWithCredentials> {
    const plain: UserWithCredentials = userAggregateToEntity(userAggregate);

    const credential = await this.queryBus.execute<
      GetActiveCredentialQuery,
      UserCredentialEntityInterface | null
    >(new GetActiveCredentialQuery(userAggregate.id));

    if (credential) {
      plain.passwordHash = credential.passwordHash;
    }

    return plain;
  }
}
