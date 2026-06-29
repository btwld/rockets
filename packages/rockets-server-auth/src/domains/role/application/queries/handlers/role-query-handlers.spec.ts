import type {
  RepositoryInterface,
  Where as WhereType,
} from '@concepta/nestjs-repository';
import type { RoleEntityInterface } from '@concepta/nestjs-role';

import { RocketsGetRoleByNameHandler } from './rockets-get-role-by-name.handler';
import { RocketsGetRoleByNameQuery } from '../impl/rockets-get-role-by-name.query';
import { AbstractRocketsGetRoleByNameHandler } from './abstract-rockets-get-role-by-name.handler';
import { RocketsGetRolesByIdsHandler } from './rockets-get-roles-by-ids.handler';
import { RocketsGetRolesByIdsQuery } from '../impl/rockets-get-roles-by-ids.query';
import { AbstractRocketsGetRolesByIdsHandler } from './abstract-rockets-get-roles-by-ids.handler';

type Repo = jest.Mocked<RepositoryInterface<RoleEntityInterface>>;

function repoFixture(): Repo {
  return {
    entityName: 'Role',
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    remove: jest.fn(),
    merge: jest.fn(),
  } as unknown as Repo;
}

describe('Role query handlers', () => {
  describe('RocketsGetRoleByNameHandler', () => {
    it('returns null when role not found', async () => {
      const repo = repoFixture();
      repo.findOne.mockResolvedValueOnce(null);
      const handler = new RocketsGetRoleByNameHandler(repo);

      const out = await handler.execute(new RocketsGetRoleByNameQuery('admin'));
      expect(out).toBeNull();
      const callArg = repo.findOne.mock.calls[0][0] as {
        where: ReturnType<typeof WhereType.eq>;
      };
      expect(callArg.where).toBeDefined();
    });

    it('returns role when found', async () => {
      const repo = repoFixture();
      const role = { id: 'r1', name: 'admin' } as RoleEntityInterface;
      repo.findOne.mockResolvedValueOnce(role);
      const handler = new RocketsGetRoleByNameHandler(repo);

      await expect(
        handler.execute(new RocketsGetRoleByNameQuery('admin')),
      ).resolves.toBe(role);
    });
  });

  describe('RocketsGetRolesByIdsHandler', () => {
    it('returns empty array when ids list empty (no repo call)', async () => {
      const repo = repoFixture();
      const handler = new RocketsGetRolesByIdsHandler(repo);

      await expect(
        handler.execute(new RocketsGetRolesByIdsQuery([])),
      ).resolves.toEqual([]);
      expect(repo.find).not.toHaveBeenCalled();
    });

    it('queries with Where.in when ids present', async () => {
      const repo = repoFixture();
      const roles = [
        { id: 'r1', name: 'admin' },
        { id: 'r2', name: 'user' },
      ] as RoleEntityInterface[];
      repo.find.mockResolvedValueOnce(roles);
      const handler = new RocketsGetRolesByIdsHandler(repo);

      const out = await handler.execute(
        new RocketsGetRolesByIdsQuery(['r1', 'r2']),
      );
      expect(out).toBe(roles);
      expect(repo.find).toHaveBeenCalledTimes(1);
    });
  });

  describe('per-method override seams', () => {
    it('byName: subclass can override `mapResponse` only', async () => {
      const repo = repoFixture();
      repo.findOne.mockResolvedValueOnce({
        id: 'r1',
        name: 'admin',
      } as RoleEntityInterface);

      class RedactedName extends AbstractRocketsGetRoleByNameHandler {
        protected mapResponse(entity: RoleEntityInterface | null) {
          return entity ? { ...entity, name: 'REDACTED' } : null;
        }
      }

      const handler = new RedactedName(repo);
      const out = await handler.execute(new RocketsGetRoleByNameQuery('admin'));
      expect(out?.name).toBe('REDACTED');
      expect(repo.findOne).toHaveBeenCalledTimes(1);
    });

    it('byName: subclass can override `fetch` only (e.g. cache layer)', async () => {
      const repo = repoFixture();
      const cached = { id: 'r1', name: 'admin' } as RoleEntityInterface;

      class WithCache extends AbstractRocketsGetRoleByNameHandler {
        protected async fetch() {
          return cached;
        }
      }

      const handler = new WithCache(repo);
      const out = await handler.execute(new RocketsGetRoleByNameQuery('admin'));
      expect(out).toBe(cached);
      expect(repo.findOne).not.toHaveBeenCalled();
    });

    it('byIds: subclass can override `mapResponse` to drop deleted roles', async () => {
      const repo = repoFixture();
      repo.find.mockResolvedValueOnce([
        { id: 'r1', name: 'admin', dateDeleted: null },
        { id: 'r2', name: 'old', dateDeleted: new Date() },
      ] as unknown as RoleEntityInterface[]);

      class DropDeleted extends AbstractRocketsGetRolesByIdsHandler {
        protected mapResponse(entities: RoleEntityInterface[]) {
          return entities.filter(
            (e) =>
              (e as unknown as { dateDeleted: Date | null }).dateDeleted ===
              null,
          );
        }
      }

      const handler = new DropDeleted(repo);
      const out = await handler.execute(
        new RocketsGetRolesByIdsQuery(['r1', 'r2']),
      );
      expect(out).toHaveLength(1);
      expect(out[0].id).toBe('r1');
    });
  });
});
