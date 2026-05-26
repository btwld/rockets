import { UnauthorizedException } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ValidateAndVerifyAccessTokenQuery } from '@concepta/nestjs-authentication';
import { GetAssignedRolesQuery } from '@concepta/nestjs-role';
import { GetUserBySubjectQuery } from '@concepta/nestjs-user';
import type { AuthRequest } from '@bitwild/rockets-core';

import { RocketsJwtAuthAdapter } from './rockets-jwt-auth.adapter';
import { RocketsGetRolesByIdsQuery } from '../domains/role/application/queries/impl/rockets-get-roles-by-ids.query';

function makeRequest(authorization?: string): AuthRequest {
  return {
    headers: authorization !== undefined ? { authorization } : {},
    query: {},
    raw: {},
  };
}

describe('RocketsJwtAuthAdapter', () => {
  let provider: RocketsJwtAuthAdapter;
  let queryBus: { execute: jest.Mock };

  beforeEach(() => {
    queryBus = { execute: jest.fn() };
    provider = new RocketsJwtAuthAdapter(queryBus as unknown as QueryBus);
  });

  it('returns matched: false when no Bearer token is present', async () => {
    const result = await provider.authenticate(makeRequest());
    expect(result).toEqual({ matched: false });
    expect(queryBus.execute).not.toHaveBeenCalled();
  });

  it('returns matched: false when Authorization scheme is not Bearer', async () => {
    const result = await provider.authenticate(
      makeRequest('Basic dXNlcjpwYXNz'),
    );
    expect(result).toEqual({ matched: false });
    expect(queryBus.execute).not.toHaveBeenCalled();
  });

  it('returns error result when token has no sub claim', async () => {
    queryBus.execute.mockResolvedValueOnce({});
    const result = await provider.authenticate(makeRequest('Bearer t'));
    expect(result).toMatchObject({ matched: true });
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toBeInstanceOf(UnauthorizedException);
    }
    expect(queryBus.execute).toHaveBeenCalledWith(
      expect.any(ValidateAndVerifyAccessTokenQuery),
    );
  });

  it('returns error result when user aggregate is missing', async () => {
    queryBus.execute
      .mockResolvedValueOnce({ sub: 's1' })
      .mockResolvedValueOnce(null);
    const result = await provider.authenticate(makeRequest('Bearer t'));
    expect(result).toMatchObject({ matched: true });
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toBeInstanceOf(UnauthorizedException);
    }
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
    const result = await provider.authenticate(makeRequest('Bearer t'));
    expect(result).toMatchObject({ matched: true });
    expect('user' in result).toBe(true);
    if ('user' in result) {
      expect(result.user.id).toBe('u1');
      expect(result.user.userRoles).toEqual([]);
    }
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
    const result = await provider.authenticate(makeRequest('Bearer t'));
    expect(result).toMatchObject({ matched: true });
    expect('user' in result).toBe(true);
    if ('user' in result) {
      expect(result.user.userRoles).toEqual([{ role: { name: 'admin' } }]);
    }
    expect(queryBus.execute).toHaveBeenNthCalledWith(
      4,
      expect.any(RocketsGetRolesByIdsQuery),
    );
  });

  it('returns error result for UnauthorizedException from inner layers', async () => {
    queryBus.execute.mockRejectedValueOnce(new UnauthorizedException('x'));
    const result = await provider.authenticate(makeRequest('Bearer t'));
    expect(result).toMatchObject({ matched: true });
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toBeInstanceOf(UnauthorizedException);
    }
  });

  it('returns generic error result for unexpected errors', async () => {
    queryBus.execute.mockRejectedValueOnce(new Error('boom'));
    const result = await provider.authenticate(makeRequest('Bearer t'));
    expect(result).toMatchObject({ matched: true });
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toBeInstanceOf(UnauthorizedException);
    }
  });
});
