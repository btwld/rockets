import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { AssignRoleCommand } from '@concepta/nestjs-role';
import { RocketsAuthRoleService } from './rockets-auth-role.service';
import type { RocketsAuthSettingsInterface } from '../../../shared/interfaces/rockets-auth-settings.interface';
import { RocketsGetRoleByNameQuery } from '../application/queries/impl/rockets-get-role-by-name.query';

describe('RocketsAuthRoleService', () => {
  let queryBus: jest.Mocked<Pick<QueryBus, 'execute'>>;
  let commandBus: jest.Mocked<Pick<CommandBus, 'execute'>>;
  let settings: RocketsAuthSettingsInterface;

  const buildService = (): RocketsAuthRoleService =>
    new RocketsAuthRoleService(
      queryBus as unknown as QueryBus,
      commandBus as unknown as CommandBus,
      settings,
    );

  beforeEach(() => {
    queryBus = { execute: jest.fn() };
    commandBus = { execute: jest.fn().mockResolvedValue(undefined) };
    settings = {
      role: { adminRoleName: 'admin', defaultUserRoleName: 'user' },
      email: {} as RocketsAuthSettingsInterface['email'],
      otp: {} as RocketsAuthSettingsInterface['otp'],
    } as RocketsAuthSettingsInterface;
  });

  it('returns false when defaultUserRoleName is not configured', async () => {
    settings = {
      ...settings,
      role: { adminRoleName: 'admin', defaultUserRoleName: undefined },
    } as RocketsAuthSettingsInterface;
    const service = buildService();
    await expect(service.assignDefaultRoleToUser('u1')).resolves.toBe(false);
    expect(queryBus.execute).not.toHaveBeenCalled();
  });

  it('assigns role and returns true when default role exists', async () => {
    queryBus.execute.mockResolvedValueOnce({ id: 'role-1', name: 'user' });
    const service = buildService();
    await expect(service.assignDefaultRoleToUser('u1')).resolves.toBe(true);
    expect(queryBus.execute).toHaveBeenCalledWith(
      expect.any(RocketsGetRoleByNameQuery),
    );
    expect(commandBus.execute).toHaveBeenCalledWith(
      expect.any(AssignRoleCommand),
    );
  });

  it('returns false when default role name is not found', async () => {
    queryBus.execute.mockResolvedValueOnce(null);
    const service = buildService();
    await expect(service.assignDefaultRoleToUser('u1')).resolves.toBe(false);
    expect(commandBus.execute).not.toHaveBeenCalled();
  });

  it('returns false on error when throwOnError is false', async () => {
    queryBus.execute.mockRejectedValueOnce(new Error('db'));
    const service = buildService();
    await expect(service.assignDefaultRoleToUser('u1', false)).resolves.toBe(
      false,
    );
  });

  it('rethrows when throwOnError is true', async () => {
    queryBus.execute.mockRejectedValueOnce(new Error('db'));
    const service = buildService();
    await expect(service.assignDefaultRoleToUser('u1', true)).rejects.toThrow(
      'db',
    );
  });
});
