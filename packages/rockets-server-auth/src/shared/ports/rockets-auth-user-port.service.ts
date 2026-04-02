import { Injectable } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ReferenceIdInterface,
  ReferenceSubject,
  UserEntityInterface,
  UserCredentialEntityInterface,
} from '@concepta/nestjs-common';
import { DomainAggregate } from '@concepta/nestjs-common/aggregate';
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

export const ROCKETS_AUTH_USER_PASSWORD_PORT_TOKEN = Symbol(
  '__ROCKETS_AUTH_USER_PASSWORD_PORT__',
);

/** User with optional credential fields for auth-local compatibility. */
interface UserWithCredentials extends UserEntityInterface {
  passwordHash?: string | null;
  passwordSalt?: string | null;
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
    try {
      const result = await this.queryBus.execute<
        RocketsGetUserBySubjectQuery,
        DomainAggregate<UserEntityInterface> | ReferenceIdInterface | null
      >(new RocketsGetUserBySubjectQuery(subject));
      if (!result) return null;
      return 'id' in result ? { id: result.id } : null;
    } catch {
      return null;
    }
  }

  async byId(id: string): Promise<UserEntityInterface | null> {
    try {
      const result = await this.queryBus.execute<
        RocketsGetUserByIdQuery,
        DomainAggregate<UserEntityInterface> | null
      >(new RocketsGetUserByIdQuery(id));
      return result ? (result.toPlain() as UserEntityInterface) : null;
    } catch {
      return null;
    }
  }

  async byEmail(email: string): Promise<UserWithCredentials | null> {
    try {
      const result = await this.queryBus.execute<
        RocketsGetUserByEmailQuery,
        DomainAggregate<UserEntityInterface> | null
      >(new RocketsGetUserByEmailQuery(email));
      if (!result) return null;
      return this.enrichWithCredentials(result);
    } catch {
      return null;
    }
  }

  async byUsername(username: string): Promise<UserWithCredentials | null> {
    try {
      const result = await this.queryBus.execute<
        RocketsGetUserByUsernameQuery,
        DomainAggregate<UserEntityInterface> | null
      >(new RocketsGetUserByUsernameQuery(username));
      if (!result) return null;
      return this.enrichWithCredentials(result);
    } catch {
      return null;
    }
  }

  async update(
    data: Partial<UserEntityInterface> & { id: string },
  ): Promise<UserEntityInterface | null> {
    try {
      const result = await this.commandBus.execute<
        RocketsUpdateUserCommand,
        DomainAggregate<UserEntityInterface> | null
      >(new RocketsUpdateUserCommand(data.id, data));
      return result ? (result.toPlain() as UserEntityInterface) : null;
    } catch {
      return null;
    }
  }

  async create(
    data: Partial<UserEntityInterface>,
  ): Promise<UserEntityInterface | null> {
    try {
      const result = await this.commandBus.execute<
        RocketsCreateUserCommand,
        DomainAggregate<UserEntityInterface> | null
      >(new RocketsCreateUserCommand(data));
      return result ? (result.toPlain() as UserEntityInterface) : null;
    } catch {
      return null;
    }
  }

  async find(options: {
    where: Record<string, unknown>;
  }): Promise<UserEntityInterface[]> {
    const { where } = options;
    if ('email' in where && typeof where.email === 'string') {
      const result = await this.byEmail(where.email);
      return result ? [result] : [];
    }
    if ('username' in where && typeof where.username === 'string') {
      const result = await this.byUsername(where.username);
      return result ? [result] : [];
    }
    if ('id' in where && typeof where.id === 'string') {
      const result = await this.byId(where.id);
      return result ? [result] : [];
    }
    return [];
  }

  /** auth-local expects passwordHash/passwordSalt on the user object. */
  private async enrichWithCredentials(
    userAggregate: DomainAggregate<UserEntityInterface>,
  ): Promise<UserWithCredentials> {
    const plain = userAggregate.toPlain() as UserWithCredentials;

    try {
      const credential = await this.queryBus.execute<
        GetActiveCredentialQuery,
        UserCredentialEntityInterface | null
      >(new GetActiveCredentialQuery(userAggregate.id));

      if (credential) {
        plain.passwordHash = credential.passwordHash;
        plain.passwordSalt = credential.passwordSalt;
      }
    } catch {
      // credentials unavailable — return user without password fields
    }

    return plain;
  }
}
