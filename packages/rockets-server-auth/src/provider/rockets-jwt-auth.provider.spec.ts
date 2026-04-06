import { UnauthorizedException } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { VerifyTokenService } from '@concepta/nestjs-authentication';
import { GetAssignedRolesQuery } from '@concepta/nestjs-role';
import { GetUserBySubjectQuery } from '@concepta/nestjs-user';
import { RocketsJwtAuthProvider } from './rockets-jwt-auth.provider';
import { RocketsGetRolesByIdsQuery } from '../domains/role/application/queries/impl/rockets-get-roles-by-ids.query';

describe('RocketsJwtAuthProvider', () => {
  let provider: RocketsJwtAuthProvider;
  let verifyTokenService: jest.Mocked<
    Pick<VerifyTokenService, 'accessToken'>
  >;
  let queryBus: jest.Mocked<Pick<QueryBus, 'execute'>>;

  beforeEach(() => {
    verifyTokenService = { accessToken: jest.fn() };
    queryBus = { execute: jest.fn() };
    provider = new RocketsJwtAuthProvider(
      verifyTokenService as unknown as VerifyTokenService,
      queryBus as unknown as QueryBus,
    );
  });

  it('rejects token without sub claim', async () => {
    verifyTokenService.accessToken.mockResolvedValue({});
    await expect(provider.validateToken('t')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects when user aggregate is missing', async () => {
    verifyTokenService.accessToken.mockResolvedValue({ sub: 's1' });
    queryBus.execute.mockResolvedValueOnce(null);
    await expect(provider.validateToken('t')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(queryBus.execute).toHaveBeenCalledWith(
      expect.any(GetUserBySubjectQuery),
    );
  });

  it('returns user with empty roles when no assignments', async () => {
    verifyTokenService.accessToken.mockResolvedValue({ sub: 's1' });
    const userAgg = {
      toPlain: () => ({ id: 'u1', email: 'a@b.com' }),
    };
    queryBus.execute
      .mockResolvedValueOnce(userAgg)
      .mockResolvedValueOnce([]);
    const out = await provider.validateToken('t');
    expect(out.id).toBe('u1');
    expect(out.userRoles).toEqual([]);
    expect(queryBus.execute).toHaveBeenNthCalledWith(
      2,
      expect.any(GetAssignedRolesQuery),
    );
  });

  it('resolves role names when assignments exist', async () => {
    verifyTokenService.accessToken.mockResolvedValue({
      sub: 's1',
      roles: ['x'],
    });
    const userAgg = {
      toPlain: () => ({ id: 'u1', email: 'a@b.com' }),
    };
    queryBus.execute
      .mockResolvedValueOnce(userAgg)
      .mockResolvedValueOnce([{ roleId: 'r1' }])
      .mockResolvedValueOnce([{ name: 'admin' }]);
    const out = await provider.validateToken('t');
    expect(out.userRoles).toEqual([{ role: { name: 'admin' } }]);
    expect(queryBus.execute).toHaveBeenNthCalledWith(
      3,
      expect.any(RocketsGetRolesByIdsQuery),
    );
  });

  it('rethrows UnauthorizedException from inner layers', async () => {
    verifyTokenService.accessToken.mockRejectedValue(
      new UnauthorizedException('x'),
    );
    await expect(provider.validateToken('t')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('wraps unexpected errors as UnauthorizedException', async () => {
    verifyTokenService.accessToken.mockRejectedValue(new Error('boom'));
    await expect(provider.validateToken('t')).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
