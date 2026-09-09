import { describe, it, expect, vi } from 'vitest';
import type { RepositoryInterface } from '@concepta/nestjs-repository';
import type { RocketsAuthUserMetadataEntityInterface } from '../../interfaces/rockets-auth-user-metadata-entity.interface';
import { UserMetadataRepository } from './user-metadata.repository';

type MetadataRow = RocketsAuthUserMetadataEntityInterface;

function repositoryWith(existing: MetadataRow | null) {
  const update = vi.fn(async (_row: MetadataRow, data: object) => ({
    ...existing,
    ...data,
  }));
  const create = vi.fn(async (data: object) => data);
  const findOne = vi.fn(async () => existing);
  // Controlled mock shape: only the three methods under test exist.
  const repo = {
    findOne,
    update,
    create,
  } as unknown as RepositoryInterface<MetadataRow>;
  return { repo, update, create };
}

describe('UserMetadataRepository.createOrUpdate', () => {
  const ctx = {};
  const existing: MetadataRow = { id: 'meta-1', userId: 'owner' };

  // Ownership comes from the caller, never from the payload: an
  // app-supplied update schema that admits `userId` must not be able to
  // move the row to another user.
  it('pins userId from the caller on the UPDATE branch', async () => {
    const { repo, update } = repositoryWith(existing);
    const sut = new UserMetadataRepository(repo);

    await sut.createOrUpdate(ctx, 'owner', {
      userId: 'someone-else',
      bio: 'hi',
    } as Record<string, unknown>);

    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][1]).toEqual({ userId: 'owner', bio: 'hi' });
  });

  it('pins userId from the caller on the CREATE branch', async () => {
    const { repo, create } = repositoryWith(null);
    const sut = new UserMetadataRepository(repo);

    await sut.createOrUpdate(ctx, 'owner', {
      userId: 'someone-else',
    } as Record<string, unknown>);

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toEqual({ userId: 'owner' });
  });
});
