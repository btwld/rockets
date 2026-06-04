import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { TransactionScope } from '@bitwild/rockets-repository';
import type { CrudContextInterface } from '@bitwild/rockets-crud';
import {
  CreateUserCommand,
  GetUserByEmailQuery,
  GetUserByUsernameQuery,
} from '@concepta/nestjs-user';
import type { RocketsAuthUserEntityInterface } from '../../../interfaces/rockets-auth-user-entity.interface';

function crudContext(): CrudContextInterface<RocketsAuthUserEntityInterface> {
  return {
    entity: 'user',
  } as unknown as CrudContextInterface<RocketsAuthUserEntityInterface>;
}

import { SignupUserHandler } from './signup-user.handler';
import { SignupUserCommand } from '../impl/signup-user.command';
import { SaveUserMetadataCommand } from '../impl/save-user-metadata.command';
import { AssignDefaultRoleCommand } from '../impl/assign-default-role.command';
import { DuplicateUserException } from '../../../domain/exceptions/user.exception';

const userPlain = { id: 'u1', email: 'a@b.com', username: 'alice' };
const aggregate = { id: 'u1', toPlain: () => userPlain };

function buildHandler() {
  const queryBus = { execute: jest.fn() };
  const commandBus = { execute: jest.fn() };
  // run the txScope callback eagerly so the test exercises the inner work
  const txScope = {
    run: jest.fn(async (_ctx: unknown, fn: () => Promise<unknown>) => fn()),
  };
  const handler = new SignupUserHandler(
    commandBus as unknown as CommandBus,
    queryBus as unknown as QueryBus,
    txScope as unknown as TransactionScope,
  );
  return { handler, queryBus, commandBus };
}

const baseDto = {
  email: 'a@b.com',
  username: 'alice',
  password: 'p',
  active: true,
};

describe('SignupUserHandler', () => {
  it('rejects with DuplicateUserException when email already exists', async () => {
    const { handler, queryBus } = buildHandler();
    queryBus.execute
      .mockResolvedValueOnce({ id: 'existing' }) // by-email
      .mockResolvedValueOnce(null); // by-username
    await expect(
      handler.execute(new SignupUserCommand(crudContext(), baseDto)),
    ).rejects.toThrow(DuplicateUserException);
  });

  it('rejects with DuplicateUserException when username already exists', async () => {
    const { handler, queryBus } = buildHandler();
    queryBus.execute
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'existing' });
    await expect(
      handler.execute(new SignupUserCommand(crudContext(), baseDto)),
    ).rejects.toThrow(DuplicateUserException);
  });

  it('creates the user and assigns the default role', async () => {
    const { handler, queryBus, commandBus } = buildHandler();
    queryBus.execute.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    commandBus.execute
      .mockResolvedValueOnce(aggregate) // CreateUserCommand
      .mockResolvedValueOnce(undefined); // AssignDefaultRoleCommand

    const out = await handler.execute(
      new SignupUserCommand(crudContext(), baseDto),
    );

    expect(out).toMatchObject({ id: 'u1', email: 'a@b.com' });
    expect(commandBus.execute).toHaveBeenNthCalledWith(
      1,
      expect.any(CreateUserCommand),
    );
    expect(commandBus.execute).toHaveBeenNthCalledWith(
      2,
      expect.any(AssignDefaultRoleCommand),
    );
    // No userMetadata in DTO → SaveUserMetadataCommand must NOT be dispatched
    expect(
      commandBus.execute.mock.calls.find(
        ([cmd]) => cmd instanceof SaveUserMetadataCommand,
      ),
    ).toBeUndefined();
  });

  it('strips user-supplied id/userId fields from userMetadata payload (security)', async () => {
    const { handler, queryBus, commandBus } = buildHandler();
    queryBus.execute.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    commandBus.execute
      .mockResolvedValueOnce(aggregate) // CreateUserCommand
      .mockResolvedValueOnce({ id: 'm1', userId: 'u1', firstName: 'ok' }) // SaveUserMetadataCommand
      .mockResolvedValueOnce(undefined); // AssignDefaultRoleCommand

    await handler.execute(
      new SignupUserCommand(crudContext(), {
        ...baseDto,
        userMetadata: {
          id: 'attacker-id',
          userId: 'attacker-user',
          firstName: 'ok',
        },
      }),
    );

    const saveCall = commandBus.execute.mock.calls.find(
      ([cmd]) => cmd instanceof SaveUserMetadataCommand,
    );
    expect(saveCall).toBeDefined();
    const saveCmd = saveCall![0] as SaveUserMetadataCommand;
    expect(saveCmd.userId).toBe('u1'); // userId from server, NOT 'attacker-user'
    expect(saveCmd.data).toEqual({ firstName: 'ok' }); // id + userId stripped
    expect(saveCmd.data).not.toHaveProperty('id');
    expect(saveCmd.data).not.toHaveProperty('userId');
  });

  it('runs the create + role assignment under txScope', async () => {
    const { handler, queryBus, commandBus } = buildHandler();
    queryBus.execute.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    commandBus.execute
      .mockResolvedValueOnce(aggregate)
      .mockResolvedValueOnce(undefined);

    await handler.execute(new SignupUserCommand(crudContext(), baseDto));

    expect(queryBus.execute).toHaveBeenCalledWith(
      expect.any(GetUserByEmailQuery),
    );
    expect(queryBus.execute).toHaveBeenCalledWith(
      expect.any(GetUserByUsernameQuery),
    );
  });
});
