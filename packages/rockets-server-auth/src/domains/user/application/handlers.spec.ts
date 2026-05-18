import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { HttpStatus } from '@nestjs/common';
import {
  GetUserQuery as UpstreamGetUserQuery,
  UpdateUserCommand as UpstreamUpdateUserCommand,
} from '@concepta/nestjs-user';

import { GetUserHandler } from './queries/handlers/get-user.handler';
import { GetUserQuery } from './queries/impl/get-user.query';
import { GetUserMetadataQuery } from './queries/impl/get-user-metadata.query';
import { UpdateUserHandler } from './commands/handlers/update-user.handler';
import { UpdateUserCommand } from './commands/impl/update-user.command';
import { SaveUserMetadataCommand } from './commands/impl/save-user-metadata.command';
import { UserException } from '../domain/exceptions/user.exception';

const userPlain = { id: 'u1', email: 'a@b.com', username: 'alice' };
const aggregate = { id: 'u1', toPlain: () => userPlain };

describe('User application handlers', () => {
  let queryBus: { execute: jest.Mock };
  let commandBus: { execute: jest.Mock };

  beforeEach(() => {
    queryBus = { execute: jest.fn() };
    commandBus = { execute: jest.fn() };
  });

  describe('GetUserHandler', () => {
    let handler: GetUserHandler;

    beforeEach(() => {
      handler = new GetUserHandler(queryBus as unknown as QueryBus);
    });

    it('throws UserException with 404 when user missing', async () => {
      queryBus.execute
        .mockResolvedValueOnce(null) // upstream get-user
        .mockResolvedValueOnce(null); // get-user-metadata
      await expect(handler.execute(new GetUserQuery('u1'))).rejects.toThrow(
        UserException,
      );
    });

    it('returns user with metadata merged', async () => {
      const meta = { id: 'm1', userId: 'u1', firstName: 'Alice' };
      queryBus.execute
        .mockResolvedValueOnce(aggregate)
        .mockResolvedValueOnce(meta);
      const out = await handler.execute(new GetUserQuery('u1'));
      expect(out).toEqual({ ...userPlain, userMetadata: meta });
      expect(queryBus.execute).toHaveBeenCalledWith(
        expect.any(UpstreamGetUserQuery),
      );
      expect(queryBus.execute).toHaveBeenCalledWith(
        expect.any(GetUserMetadataQuery),
      );
    });

    it('returns user with userMetadata=undefined when no metadata', async () => {
      queryBus.execute
        .mockResolvedValueOnce(aggregate)
        .mockResolvedValueOnce(null);
      const out = await handler.execute(new GetUserQuery('u1'));
      expect(out.userMetadata).toBeUndefined();
    });

    it('UserException carries 404 httpStatus', async () => {
      queryBus.execute.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
      try {
        await handler.execute(new GetUserQuery('u1'));
        fail('expected throw');
      } catch (err) {
        expect(err).toBeInstanceOf(UserException);
        expect((err as UserException).httpStatus).toBe(HttpStatus.NOT_FOUND);
      }
    });
  });

  describe('UpdateUserHandler', () => {
    let handler: UpdateUserHandler;

    beforeEach(() => {
      handler = new UpdateUserHandler(
        commandBus as unknown as CommandBus,
        queryBus as unknown as QueryBus,
      );
    });

    const ctx = { entity: 'user' } as unknown as UpdateUserCommand['ctx'];

    it('saves metadata when DTO carries userMetadata', async () => {
      const meta = { id: 'm1', userId: 'u1', firstName: 'Alice' };
      commandBus.execute
        .mockResolvedValueOnce(aggregate) // upstream update-user
        .mockResolvedValueOnce(meta); // save-user-metadata
      const out = await handler.execute(
        new UpdateUserCommand(ctx, 'u1', {
          active: true,
          userMetadata: { firstName: 'Alice' },
        }),
      );
      expect(out).toEqual({ ...userPlain, userMetadata: meta });
      expect(commandBus.execute).toHaveBeenNthCalledWith(
        1,
        expect.any(UpstreamUpdateUserCommand),
      );
      expect(commandBus.execute).toHaveBeenNthCalledWith(
        2,
        expect.any(SaveUserMetadataCommand),
      );
    });

    it('reads metadata via query when DTO has no userMetadata', async () => {
      const meta = { id: 'm1', userId: 'u1', firstName: 'Old' };
      commandBus.execute.mockResolvedValueOnce(aggregate); // upstream update-user
      queryBus.execute.mockResolvedValueOnce(meta); // get-user-metadata
      const out = await handler.execute(
        new UpdateUserCommand(ctx, 'u1', { active: false }),
      );
      expect(out).toEqual({ ...userPlain, userMetadata: meta });
      expect(queryBus.execute).toHaveBeenCalledWith(
        expect.any(GetUserMetadataQuery),
      );
    });

    it('returns userMetadata=undefined when DTO empty + no stored metadata', async () => {
      commandBus.execute.mockResolvedValueOnce(aggregate);
      queryBus.execute.mockResolvedValueOnce(null);
      const out = await handler.execute(new UpdateUserCommand(ctx, 'u1', {}));
      expect(out.userMetadata).toBeUndefined();
    });

    it('reads metadata via query when DTO has empty userMetadata object', async () => {
      const meta = { id: 'm1', userId: 'u1', firstName: 'Old' };
      commandBus.execute.mockResolvedValueOnce(aggregate);
      queryBus.execute.mockResolvedValueOnce(meta);
      const out = await handler.execute(
        new UpdateUserCommand(ctx, 'u1', { userMetadata: {} }),
      );
      expect(out.userMetadata).toEqual(meta);
    });
  });
});
