import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { IsAssignedRoleQuery } from '@concepta/nestjs-role';
import { AdminGuard } from './admin.guard';
import type { RocketsAuthSettingsInterface } from '../shared/interfaces/rockets-auth-settings.interface';
import { RocketsGetRoleByNameQuery } from '../domains/role/application/queries/impl/rockets-get-role-by-name.query';

jest.mock('../shared/utils/error-logging.helper', () => ({
  logAndGetErrorDetails: jest.fn().mockReturnValue({ errorMessage: 'err' }),
}));

describe('AdminGuard', () => {
  let guard: AdminGuard;
  let queryBus: jest.Mocked<Pick<QueryBus, 'execute'>>;
  let settings: RocketsAuthSettingsInterface;

  const createContext = (user: { id: string } | undefined): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    }) as ExecutionContext;

  beforeEach(() => {
    queryBus = { execute: jest.fn() };
    settings = {
      role: { adminRoleName: 'admin' },
    } as RocketsAuthSettingsInterface;
    guard = new AdminGuard(
      settings,
      queryBus as unknown as QueryBus,
    );
  });

  it('throws UnauthorizedException when user missing', async () => {
    await expect(
      guard.canActivate(createContext(undefined)),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('throws ForbiddenException when admin role name not configured', async () => {
    settings.role = { adminRoleName: '' } as RocketsAuthSettingsInterface['role'];
    const g = new AdminGuard(settings, queryBus as unknown as QueryBus);
    await expect(
      g.canActivate(createContext({ id: 'u1' })),
    ).rejects.toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when admin role entity missing', async () => {
    queryBus.execute.mockResolvedValueOnce(null);
    await expect(
      guard.canActivate(createContext({ id: 'u1' })),
    ).rejects.toThrow(ForbiddenException);
  });

  it('returns true when user has assigned admin role', async () => {
    queryBus.execute
      .mockResolvedValueOnce({ id: 'role-admin', name: 'admin' })
      .mockResolvedValueOnce(true);
    await expect(
      guard.canActivate(createContext({ id: 'u1' })),
    ).resolves.toBe(true);
    expect(queryBus.execute).toHaveBeenNthCalledWith(
      2,
      expect.any(IsAssignedRoleQuery),
    );
  });

  it('maps non-forbidden errors to ServiceUnavailableException', async () => {
    queryBus.execute.mockRejectedValueOnce(new Error('db down'));
    await expect(
      guard.canActivate(createContext({ id: 'u1' })),
    ).rejects.toMatchObject({ status: 503 });
  });
});
