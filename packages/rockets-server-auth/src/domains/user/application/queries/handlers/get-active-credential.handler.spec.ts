import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import type { UserCredentialEntityInterface } from '@concepta/nestjs-user';
import {
  AppContextHost,
  type RepositoryInterface,
} from '@concepta/rockets-core';

import { GetActiveCredentialHandler } from './get-active-credential.handler';
import { GetActiveCredentialQuery } from '../impl/get-active-credential.query';

describe(GetActiveCredentialHandler.name, () => {
  let repo: { findOne: Mock };
  let handler: GetActiveCredentialHandler;

  beforeEach(() => {
    repo = { findOne: vi.fn().mockResolvedValue(null) };
    handler = new GetActiveCredentialHandler(
      repo as unknown as RepositoryInterface<UserCredentialEntityInterface>,
    );
  });

  it('forwards the caller context instance, so hooks and the surrounding transaction stay attached', async () => {
    const ctx = new AppContextHost();

    await handler.execute(new GetActiveCredentialQuery(ctx, 'u1'));

    expect(repo.findOne).toHaveBeenCalledOnce();
    expect(repo.findOne.mock.calls[0][0].ctx).toBe(ctx);
  });

  it('rejects a context that is not an AppContextHost instead of running hook-free on a fresh one', async () => {
    await expect(
      handler.execute(new GetActiveCredentialQuery({ stray: true }, 'u1')),
    ).rejects.toThrow(/AppContextHost/);

    expect(repo.findOne).not.toHaveBeenCalled();
  });
});
