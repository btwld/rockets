import { describe, it, expect, vi } from 'vitest';
import type { RepositoryInterface } from '@concepta/nestjs-repository';
import type { UserMetadataEntityInterface } from '../../../domain/interfaces/user-metadata.interface';
import { UpsertUserMetadataCommand } from '../impl/upsert-user-metadata.command';
import { UpsertUserMetadataHandler } from './upsert-user-metadata.handler';

type Row = UserMetadataEntityInterface;

function repositoryWith(existing: Row | null) {
  const findOne = vi.fn(async (_options: object) => existing);
  const update = vi.fn(async (_row: Row, data: object, _options: object) => ({
    ...existing,
    ...data,
  }));
  const create = vi.fn(async (data: object, _options: object) => data);
  // Controlled mock shape: only the three methods under test exist.
  const repo = {
    findOne,
    update,
    create,
  } as unknown as RepositoryInterface<Row>;
  return { repo, findOne, update, create };
}

describe('UpsertUserMetadataHandler', () => {
  const ctx = { request: 'r1' };
  const existing = { id: 'meta-1', userId: 'owner' } as Row;

  // Every repository call forwards `ctx` (AGENTS.md rule 16): a call that
  // omits it runs with hooks disabled and outside the request transaction.
  it('forwards ctx to findOne and update on the UPDATE branch', async () => {
    const { repo, findOne, update } = repositoryWith(existing);
    const sut = new UpsertUserMetadataHandler(repo);

    await sut.execute(new UpsertUserMetadataCommand(ctx, 'owner', { a: 1 }));

    expect(findOne.mock.calls[0][0]).toMatchObject({ ctx });
    expect(update.mock.calls[0][2]).toEqual({ ctx });
  });

  it('forwards ctx to findOne and create on the CREATE branch', async () => {
    const { repo, findOne, create } = repositoryWith(null);
    const sut = new UpsertUserMetadataHandler(repo);

    await sut.execute(new UpsertUserMetadataCommand(ctx, 'owner', { a: 1 }));

    expect(findOne.mock.calls[0][0]).toMatchObject({ ctx });
    expect(create.mock.calls[0][1]).toEqual({ ctx });
  });

  // Ownership comes from the caller, never from the payload: an
  // app-supplied update schema that admits `userId` must not be able to
  // move the row to another user.
  it('pins userId from the caller on both branches', async () => {
    const updating = repositoryWith(existing);
    await new UpsertUserMetadataHandler(updating.repo).execute(
      new UpsertUserMetadataCommand(ctx, 'owner', {
        userId: 'someone-else',
        a: 1,
      }),
    );
    expect(updating.update.mock.calls[0][1]).toEqual({ userId: 'owner', a: 1 });

    const creating = repositoryWith(null);
    await new UpsertUserMetadataHandler(creating.repo).execute(
      new UpsertUserMetadataCommand(ctx, 'owner', { userId: 'someone-else' }),
    );
    expect(creating.create.mock.calls[0][0]).toEqual({ userId: 'owner' });
  });
});
