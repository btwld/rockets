import { InternalServerErrorException } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { AssignRoleCommand } from '@concepta/nestjs-role';

import { AssignDefaultRoleHandler } from './assign-default-role.handler';
import { AssignDefaultRoleCommand } from '../impl/assign-default-role.command';
import { RocketsGetRoleByNameQuery } from '../../../../role/application/queries/impl/rockets-get-role-by-name.query';
import { RocketsAuthSettingsInterface } from '../../../../../shared/interfaces/rockets-auth-settings.interface';

function buildSettings(
  overrides: Partial<RocketsAuthSettingsInterface['role']> = {},
): RocketsAuthSettingsInterface {
  return {
    role: { adminRoleName: 'admin', ...overrides },
  } as RocketsAuthSettingsInterface;
}

describe('AssignDefaultRoleHandler', () => {
  let queryBus: { execute: jest.Mock };
  let commandBus: { execute: jest.Mock };

  beforeEach(() => {
    queryBus = { execute: jest.fn() };
    commandBus = { execute: jest.fn() };
  });

  it('returns false and skips assignment when defaultUserRoleName unset', async () => {
    const handler = new AssignDefaultRoleHandler(
      queryBus as unknown as QueryBus,
      commandBus as unknown as CommandBus,
      buildSettings(),
    );
    const out = await handler.execute(new AssignDefaultRoleCommand('u1'));
    expect(out).toBe(false);
    expect(queryBus.execute).not.toHaveBeenCalled();
    expect(commandBus.execute).not.toHaveBeenCalled();
  });

  it('throws when configured role does not exist in the database', async () => {
    queryBus.execute.mockResolvedValueOnce(null);
    const handler = new AssignDefaultRoleHandler(
      queryBus as unknown as QueryBus,
      commandBus as unknown as CommandBus,
      buildSettings({ defaultUserRoleName: 'user' }),
    );
    await expect(
      handler.execute(new AssignDefaultRoleCommand('u1')),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(queryBus.execute).toHaveBeenCalledWith(
      expect.any(RocketsGetRoleByNameQuery),
    );
    expect(commandBus.execute).not.toHaveBeenCalled();
  });

  it('returns true and dispatches AssignRoleCommand on success', async () => {
    queryBus.execute.mockResolvedValueOnce({ id: 'r-default', name: 'user' });
    commandBus.execute.mockResolvedValueOnce(undefined);
    const handler = new AssignDefaultRoleHandler(
      queryBus as unknown as QueryBus,
      commandBus as unknown as CommandBus,
      buildSettings({ defaultUserRoleName: 'user' }),
    );
    const out = await handler.execute(new AssignDefaultRoleCommand('u1'));
    expect(out).toBe(true);
    expect(commandBus.execute).toHaveBeenCalledWith(
      expect.any(AssignRoleCommand),
    );
  });

  it('propagates errors from the role assignment command', async () => {
    queryBus.execute.mockResolvedValueOnce({ id: 'r-default', name: 'user' });
    commandBus.execute.mockRejectedValueOnce(new Error('db down'));
    const handler = new AssignDefaultRoleHandler(
      queryBus as unknown as QueryBus,
      commandBus as unknown as CommandBus,
      buildSettings({ defaultUserRoleName: 'user' }),
    );
    await expect(
      handler.execute(new AssignDefaultRoleCommand('u1')),
    ).rejects.toThrow('db down');
  });
});
