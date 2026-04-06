/**
 * Contrato entre {@link UserMetadataRepositoryFixture} e
 * {@link GenericUserMetadataModelService}: mesma forma de `where` que o stack
 * Concepta (`Where.eq`), e os métodos `findOne`, `create` e `update` usados em produção.
 *
 * Ao migrar o adapter (ex.: TypeORM v8), estes testes devem continuar a passar ou
 * falhar de forma explícita para forçar alinhamento do novo repositório.
 */
import { Where, type RepositoryInterface } from '@concepta/nestjs-repository';
import { NotFoundException } from '@nestjs/common';
import { GenericUserMetadataModelService } from '../../modules/user-metadata/services/user-metadata.model.service';
import type {
  UserMetadataEntityInterface,
  UserMetadataModelUpdatableInterface,
} from '../../modules/user-metadata/interfaces/user-metadata.interface';
import { UserMetadataEntityFixture } from '../entities/user-metadata.entity.fixture';
import { UserMetadataRepositoryFixture } from './user-metadata.repository.fixture';

class ContractCreateDto {
  userId!: string;
}

class ContractUpdateDto implements UserMetadataModelUpdatableInterface {
  id!: string;
  firstName?: string;
  bio?: string;
  email?: string;
}

function asWhereClause(where: ReturnType<typeof Where.eq>): Record<string, unknown> {
  return where as unknown as Record<string, unknown>;
}

function asRepository(
  fixture: UserMetadataRepositoryFixture,
): RepositoryInterface<UserMetadataEntityInterface> {
  return fixture as unknown as RepositoryInterface<UserMetadataEntityInterface>;
}

describe('UserMetadataRepositoryFixture — contrato com o model service', () => {
  describe('resolução de where (compatível com Where.eq do nestjs-repository)', () => {
    it('findOne com Where.eq em id devolve o registo correcto', async () => {
      const repo = new UserMetadataRepositoryFixture();
      const row = await repo.findOne({
        where: asWhereClause(Where.eq('id', 'userMetadata-1')),
      });
      expect(row).not.toBeNull();
      expect(row?.id).toBe('userMetadata-1');
      expect(row?.userId).toBe('serverauth-user-1');
    });

    it('findOne com Where.eq em userId devolve o registo correcto', async () => {
      const repo = new UserMetadataRepositoryFixture();
      const row = await repo.findOne({
        where: asWhereClause(Where.eq('userId', 'serverauth-user-1')),
      });
      expect(row).not.toBeNull();
      expect(row?.id).toBe('userMetadata-1');
    });

    it('findOne devolve null quando não existe id', async () => {
      const repo = new UserMetadataRepositoryFixture();
      await expect(
        repo.findOne({
          where: asWhereClause(Where.eq('id', 'no-such-id')),
        }),
      ).resolves.toBeNull();
    });
  });

  describe('GenericUserMetadataModelService com repositório real (sem mocks)', () => {
    it('getUserMetadataById usa findOne por id', async () => {
      const repo = new UserMetadataRepositoryFixture();
      const service = new GenericUserMetadataModelService(
        asRepository(repo),
        ContractCreateDto,
        ContractUpdateDto,
      );
      const row = await service.getUserMetadataById('userMetadata-1');
      expect(row.userId).toBe('serverauth-user-1');
    });

    it('getUserMetadataById lança NotFound quando o repositório não encontra', async () => {
      const repo = new UserMetadataRepositoryFixture();
      const service = new GenericUserMetadataModelService(
        asRepository(repo),
        ContractCreateDto,
        ContractUpdateDto,
      );
      await expect(service.getUserMetadataById('missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('createOrUpdate em estado vazio cria via create e persiste no fixture', async () => {
      const repo = new UserMetadataRepositoryFixture();
      await repo.clear();
      const service = new GenericUserMetadataModelService(
        asRepository(repo),
        ContractCreateDto,
        ContractUpdateDto,
      );
      const created = await service.createOrUpdate('new-user-99', {
        firstName: 'Novo',
      });
      expect(created.userId).toBe('new-user-99');
      expect((created as UserMetadataEntityFixture).firstName).toBe('Novo');
      const again = await service.findByUserId('new-user-99');
      expect(again?.id).toBe(created.id);
    });

    it('createOrUpdate com registo existente usa update (findOne id + repo.update)', async () => {
      const repo = new UserMetadataRepositoryFixture();
      const service = new GenericUserMetadataModelService(
        asRepository(repo),
        ContractCreateDto,
        ContractUpdateDto,
      );
      const updated = await service.createOrUpdate('serverauth-user-1', {
        bio: 'Contrato migracao',
      });
      expect(updated.userId).toBe('serverauth-user-1');
      expect((updated as UserMetadataEntityFixture).bio).toBe(
        'Contrato migracao',
      );
      expect(updated.id).toBe('userMetadata-1');
    });

    it('update aplica merge no registo devolvido por findOne', async () => {
      const repo = new UserMetadataRepositoryFixture();
      const service = new GenericUserMetadataModelService(
        asRepository(repo),
        ContractCreateDto,
        ContractUpdateDto,
      );
      const patch: ContractUpdateDto = {
        id: 'userMetadata-1',
        firstName: 'Migrado',
      };
      const result = await service.update(patch);
      expect(result.id).toBe('userMetadata-1');
      expect((result as UserMetadataEntityFixture).firstName).toBe('Migrado');
    });
  });

  describe('UserMetadataRepositoryFixture.update (integridade interna)', () => {
    it('lança quando o id não existe no mapa', async () => {
      const repo = new UserMetadataRepositoryFixture();
      await expect(
        repo.update('inexistente', { version: 1 }),
      ).rejects.toThrow(/not found/);
    });
  });
});
