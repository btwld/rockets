import { UnauthorizedException } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ValidateAndVerifyAccessTokenQuery } from '@concepta/nestjs-authentication';
import { GetAssignedRolesQuery } from '@concepta/nestjs-role';
import { GetUserBySubjectQuery } from '@concepta/nestjs-user';

import { RocketsJwtAuthAdapter } from './rockets-jwt-auth.adapter';
import { RocketsGetRolesByIdsQuery } from '../domains/role/application/queries/impl/rockets-get-roles-by-ids.query';

describe('RocketsJwtAuthAdapter', () => {
  let provider: RocketsJwtAuthAdapter;
  let queryBus: { execute: jest.Mock };

  beforeEach(() => {
    queryBus = { execute: jest.fn() };
    provider = new RocketsJwtAuthAdapter(queryBus as unknown as QueryBus);
  });

  it('rejects token without sub claim', async () => {
    queryBus.execute.mockResolvedValueOnce({});
    await expect(provider.validateToken('t')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(queryBus.execute).toHaveBeenCalledWith(
      expect.any(ValidateAndVerifyAccessTokenQuery),
    );
  });

  it('rejects when user aggregate is missing', async () => {
    queryBus.execute
      .mockResolvedValueOnce({ sub: 's1' })
      .mockResolvedValueOnce(null);
    await expect(provider.validateToken('t')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(queryBus.execute).toHaveBeenNthCalledWith(
      2,
      expect.any(GetUserBySubjectQuery),
    );
  });

  it('returns user with empty roles when no assignments', async () => {
    const userAgg = { toPlain: () => ({ id: 'u1', email: 'a@b.com' }) };
    queryBus.execute
      .mockResolvedValueOnce({ sub: 's1' })
      .mockResolvedValueOnce(userAgg)
      .mockResolvedValueOnce([]);
    const out = await provider.validateToken('t');
    expect(out.id).toBe('u1');
    expect(out.userRoles).toEqual([]);
    expect(queryBus.execute).toHaveBeenNthCalledWith(
      3,
      expect.any(GetAssignedRolesQuery),
    );
  });

  it('resolves role names when assignments exist', async () => {
    const userAgg = { toPlain: () => ({ id: 'u1', email: 'a@b.com' }) };
    queryBus.execute
      .mockResolvedValueOnce({ sub: 's1', roles: ['x'] })
      .mockResolvedValueOnce(userAgg)
      .mockResolvedValueOnce([{ roleId: 'r1' }])
      .mockResolvedValueOnce([{ name: 'admin' }]);
    const out = await provider.validateToken('t');
    expect(out.userRoles).toEqual([{ role: { name: 'admin' } }]);
    expect(queryBus.execute).toHaveBeenNthCalledWith(
      4,
      expect.any(RocketsGetRolesByIdsQuery),
    );
  });

  it('rethrows UnauthorizedException from inner layers', async () => {
    queryBus.execute.mockRejectedValueOnce(new UnauthorizedException('x'));
    await expect(provider.validateToken('t')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('wraps unexpected errors as UnauthorizedException', async () => {
    queryBus.execute.mockRejectedValueOnce(new Error('boom'));
    await expect(provider.validateToken('t')).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
