import { Injectable } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import {
  InjectDynamicRepository,
  RepositoryInterface,
  Where,
} from '@bitwild/rockets-repository';
import type {
  AuthAdapterInterface,
  AuthAttemptResult,
  AuthRequest,
} from '@bitwild/rockets-core';
import { ApiKeyEntity } from './api-key.entity';

/**
 * Authenticates requests via an `X-API-Key` header.
 *
 * Returns `matched: false` when the header is absent so the guard
 * falls through to the next adapter in the chain (e.g., Firebase).
 *
 * Returns `matched: true, error` when the header is present but the
 * key is not found — the guard stops the chain immediately without
 * trying the next adapter.
 */
@Injectable()
export class ApiKeyAuthAdapter implements AuthAdapterInterface {
  constructor(
    @InjectDynamicRepository(ApiKeyEntity)
    private readonly repo: RepositoryInterface<ApiKeyEntity>,
  ) {}

  async authenticate(request: AuthRequest): Promise<AuthAttemptResult> {
    const raw = request.headers['x-api-key'];
    const key = Array.isArray(raw) ? raw[0] : raw;
    if (!key) return { matched: false };

    const record = await this.repo.findOne({
      where: Where.eq<ApiKeyEntity>('key', key),
    });

    if (!record) {
      return {
        matched: true,
        error: new UnauthorizedException('Authentication failed'),
      };
    }

    return {
      matched: true,
      user: {
        id: record.userId,
        sub: record.userId,
        userRoles: [],
        claims: { provider: 'api-key', keyId: record.id },
      },
    };
  }
}
