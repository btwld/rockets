import { CommandBus, QueryBus } from '@nestjs/cqrs';

import { RocketsAuthUserPortService } from './rockets-auth-user-port.service';
import { RocketsGetUserByIdQuery } from '../../domains/user/application/queries/impl/rockets-get-user-by-id.query';
import { RocketsGetUserByEmailQuery } from '../../domains/user/application/queries/impl/rockets-get-user-by-email.query';
import { RocketsGetUserByUsernameQuery } from '../../domains/user/application/queries/impl/rockets-get-user-by-username.query';
import { RocketsGetUserBySubjectQuery } from '../../domains/user/application/queries/impl/rockets-get-user-by-subject.query';
import { RocketsCreateUserCommand } from '../../domains/user/application/commands/impl/rockets-create-user.command';
import { RocketsUpdateUserCommand } from '../../domains/user/application/commands/impl/rockets-update-user.command';
import { GetActiveCredentialQuery } from '../../domains/user/application/queries/impl/get-active-credential.query';

describe('RocketsAuthUserPortService', () => {
  let service: RocketsAuthUserPortService;
  let queryBus: { execute: jest.Mock };
  let commandBus: { execute: jest.Mock };

  const userPlain = { id: 'u1', email: 'a@b.com', username: 'alice' };
  const aggregate = { id: 'u1', toPlain: () => userPlain };

  beforeEach(() => {
    queryBus = { execute: jest.fn() };
    commandBus = { execute: jest.fn() };
    service = new RocketsAuthUserPortService(
      queryBus as unknown as QueryBus,
      commandBus as unknown as CommandBus,
    );
  });

  describe('bySubject', () => {
    it('returns null when no result', async () => {
      queryBus.execute.mockResolvedValueOnce(null);
      await expect(service.bySubject('s1')).resolves.toBeNull();
      expect(queryBus.execute).toHaveBeenCalledWith(
        expect.any(RocketsGetUserBySubjectQuery),
      );
    });

    it('returns { id } when result has id', async () => {
      queryBus.execute.mockResolvedValueOnce({ id: 'u1' });
      await expect(service.bySubject('s1')).resolves.toEqual({ id: 'u1' });
    });

    it('returns null when result has no id field', async () => {
      queryBus.execute.mockResolvedValueOnce({});
      await expect(service.bySubject('s1')).resolves.toBeNull();
    });

    it('propagates query bus errors instead of swallowing', async () => {
      queryBus.execute.mockRejectedValueOnce(new Error('db down'));
      await expect(service.bySubject('s1')).rejects.toThrow('db down');
    });
  });

  describe('byId', () => {
    it('returns null when handler returns null', async () => {
      queryBus.execute.mockResolvedValueOnce(null);
      await expect(service.byId('u1')).resolves.toBeNull();
    });

    it('returns plain user from aggregate.toPlain()', async () => {
      queryBus.execute.mockResolvedValueOnce(aggregate);
      await expect(service.byId('u1')).resolves.toEqual(userPlain);
      expect(queryBus.execute).toHaveBeenCalledWith(
        expect.any(RocketsGetUserByIdQuery),
      );
    });

    it('propagates errors', async () => {
      queryBus.execute.mockRejectedValueOnce(new Error('boom'));
      await expect(service.byId('u1')).rejects.toThrow('boom');
    });
  });

  describe('byEmail (with credential enrichment)', () => {
    it('returns null when no user', async () => {
      queryBus.execute.mockResolvedValueOnce(null);
      await expect(service.byEmail('a@b.com')).resolves.toBeNull();
    });

    it('enriches user with passwordHash when credential exists', async () => {
      queryBus.execute
        .mockResolvedValueOnce(aggregate)
        .mockResolvedValueOnce({ passwordHash: 'hash1' });
      await expect(service.byEmail('a@b.com')).resolves.toEqual({
        ...userPlain,
        passwordHash: 'hash1',
      });
      expect(queryBus.execute).toHaveBeenNthCalledWith(
        1,
        expect.any(RocketsGetUserByEmailQuery),
      );
      expect(queryBus.execute).toHaveBeenNthCalledWith(
        2,
        expect.any(GetActiveCredentialQuery),
      );
    });

    it('returns user without passwordHash when no credential', async () => {
      queryBus.execute
        .mockResolvedValueOnce(aggregate)
        .mockResolvedValueOnce(null);
      await expect(service.byEmail('a@b.com')).resolves.toEqual(userPlain);
    });
  });

  describe('byUsername', () => {
    it('returns null when no user', async () => {
      queryBus.execute.mockResolvedValueOnce(null);
      await expect(service.byUsername('alice')).resolves.toBeNull();
    });

    it('enriches with credential', async () => {
      queryBus.execute
        .mockResolvedValueOnce(aggregate)
        .mockResolvedValueOnce({ passwordHash: 'hash2' });
      await expect(service.byUsername('alice')).resolves.toEqual({
        ...userPlain,
        passwordHash: 'hash2',
      });
      expect(queryBus.execute).toHaveBeenNthCalledWith(
        1,
        expect.any(RocketsGetUserByUsernameQuery),
      );
    });
  });

  describe('update', () => {
    it('returns null when handler returns null', async () => {
      commandBus.execute.mockResolvedValueOnce(null);
      await expect(service.update({ id: 'u1' })).resolves.toBeNull();
    });

    it('returns plain user from updated aggregate', async () => {
      commandBus.execute.mockResolvedValueOnce(aggregate);
      await expect(
        service.update({ id: 'u1', email: 'new@b.com' }),
      ).resolves.toEqual(userPlain);
      expect(commandBus.execute).toHaveBeenCalledWith(
        expect.any(RocketsUpdateUserCommand),
      );
    });
  });

  describe('create', () => {
    it('returns null when handler returns null', async () => {
      commandBus.execute.mockResolvedValueOnce(null);
      await expect(service.create({ email: 'a@b.com' })).resolves.toBeNull();
    });

    it('returns plain user from created aggregate', async () => {
      commandBus.execute.mockResolvedValueOnce(aggregate);
      await expect(service.create({ email: 'a@b.com' })).resolves.toEqual(
        userPlain,
      );
      expect(commandBus.execute).toHaveBeenCalledWith(
        expect.any(RocketsCreateUserCommand),
      );
    });
  });
});
