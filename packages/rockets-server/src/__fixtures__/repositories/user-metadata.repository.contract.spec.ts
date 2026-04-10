/**
 * Contract between {@link UserMetadataRepositoryFixture} and
 * {@link UpsertUserMetadataHandler} / {@link GetUserMetadataHandler}:
 * same `where` shape as Concepta's `Where.eq`, and the `findOne`, `create`,
 * `update` methods used by production handlers.
 */
import { Where, type RepositoryInterface } from '@concepta/nestjs-repository';
import type { UserMetadataEntityInterface } from '../../domain/interfaces/user-metadata.interface';
import { UserMetadataEntityFixture } from '../entities/user-metadata.entity.fixture';
import { UserMetadataRepositoryFixture } from './user-metadata.repository.fixture';
import { UpsertUserMetadataHandler } from '../../application/commands/handlers/upsert-user-metadata.handler';
import { UpsertUserMetadataCommand } from '../../application/commands/impl/upsert-user-metadata.command';
import { GetUserMetadataHandler } from '../../application/queries/handlers/get-user-metadata.handler';
import { GetUserMetadataQuery } from '../../application/queries/impl/get-user-metadata.query';

function asWhereClause(
  where: ReturnType<typeof Where.eq>,
): Record<string, unknown> {
  return where as unknown as Record<string, unknown>;
}

function asRepository(
  fixture: UserMetadataRepositoryFixture,
): RepositoryInterface<UserMetadataEntityInterface> {
  return fixture as unknown as RepositoryInterface<UserMetadataEntityInterface>;
}

describe('UserMetadataRepositoryFixture — handler contract', () => {
  describe('Where.eq resolution (nestjs-repository compat)', () => {
    it('findOne with Where.eq on id returns the correct record', async () => {
      const repo = new UserMetadataRepositoryFixture();
      const row = await repo.findOne({
        where: asWhereClause(Where.eq('id', 'userMetadata-1')),
      });
      expect(row).not.toBeNull();
      expect(row?.id).toBe('userMetadata-1');
      expect(row?.userId).toBe('serverauth-user-1');
    });

    it('findOne with Where.eq on userId returns the correct record', async () => {
      const repo = new UserMetadataRepositoryFixture();
      const row = await repo.findOne({
        where: asWhereClause(Where.eq('userId', 'serverauth-user-1')),
      });
      expect(row).not.toBeNull();
      expect(row?.id).toBe('userMetadata-1');
    });

    it('findOne returns null when id does not exist', async () => {
      const repo = new UserMetadataRepositoryFixture();
      await expect(
        repo.findOne({
          where: asWhereClause(Where.eq('id', 'no-such-id')),
        }),
      ).resolves.toBeNull();
    });
  });

  describe('UpsertUserMetadataHandler with real fixture repository', () => {
    it('upsert creates new metadata when none exists', async () => {
      const repo = new UserMetadataRepositoryFixture();
      await repo.clear();
      const handler = new UpsertUserMetadataHandler(asRepository(repo));
      const created = await handler.execute(
        new UpsertUserMetadataCommand('new-user-99', { firstName: 'Novo' }),
      );
      expect(created.userId).toBe('new-user-99');
      expect((created as UserMetadataEntityFixture).firstName).toBe('Novo');
    });

    it('upsert updates existing metadata', async () => {
      const repo = new UserMetadataRepositoryFixture();
      const handler = new UpsertUserMetadataHandler(asRepository(repo));
      const updated = await handler.execute(
        new UpsertUserMetadataCommand('serverauth-user-1', {
          bio: 'Contract migration',
        }),
      );
      expect(updated.userId).toBe('serverauth-user-1');
      expect((updated as UserMetadataEntityFixture).bio).toBe(
        'Contract migration',
      );
      expect(updated.id).toBe('userMetadata-1');
    });
  });

  describe('GetUserMetadataHandler with real fixture repository', () => {
    it('get returns metadata for existing user', async () => {
      const repo = new UserMetadataRepositoryFixture();
      const handler = new GetUserMetadataHandler(asRepository(repo));
      const result = await handler.execute(
        new GetUserMetadataQuery('serverauth-user-1'),
      );
      expect(result).not.toBeNull();
      expect(result?.id).toBe('userMetadata-1');
    });

    it('get returns null for non-existent user', async () => {
      const repo = new UserMetadataRepositoryFixture();
      const handler = new GetUserMetadataHandler(asRepository(repo));
      const result = await handler.execute(
        new GetUserMetadataQuery('no-such-user'),
      );
      expect(result).toBeNull();
    });
  });

  describe('UserMetadataRepositoryFixture.update (internal integrity)', () => {
    it('throws when id does not exist', async () => {
      const repo = new UserMetadataRepositoryFixture();
      await expect(repo.update('inexistent', { version: 1 })).rejects.toThrow(
        /not found/,
      );
    });
  });
});
