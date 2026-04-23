import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import { TypeOrmRepositoryModule } from '@concepta/nestjs-repository-typeorm';
import type { RepositoryModuleInterface } from '@concepta/nestjs-repository';
import type { RepositoryPersistenceConfig } from '../../domain/interfaces/repository-persistence.interface';
import type { RocketsRepositoriesConfig } from '../../domain/interfaces/rockets-repositories.interface';
import { USER_METADATA_MODULE_ENTITY_KEY } from '../../rockets-core.constants';
import { flattenRepositories } from './flatten-repositories';

@Entity('user_metadata_t')
class UserMetadataEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  userId!: string;
}

@Entity('users_t')
class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;
}

@Entity('audit_t')
class AuditEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;
}

// Fake alternate module for override tests
const FakeFirestoreModule = {
  forFeature: () => ({ module: FakeFirestoreModule }),
} as unknown as RepositoryModuleInterface;

describe('flattenRepositories', () => {
  it('registers userMetadata with the root module when no override', () => {
    const config: RocketsRepositoriesConfig = {
      module: TypeOrmRepositoryModule,
      userMetadata: { entity: UserMetadataEntity },
    };

    const result = flattenRepositories(config);

    expect(result).toHaveLength(1);
    expect(result[0].module).toBe(TypeOrmRepositoryModule);
    expect(result[0].entities).toHaveLength(1);
    expect(result[0].entities[0].key).toBe(USER_METADATA_MODULE_ENTITY_KEY);
    expect(result[0].entities[0].entity).toBe(UserMetadataEntity);
  });

  it('groups userMetadata and additional entities under the same module', () => {
    const config: RocketsRepositoriesConfig = {
      module: TypeOrmRepositoryModule,
      userMetadata: { entity: UserMetadataEntity },
      entities: [
        { key: 'user', entity: UserEntity },
        { key: 'audit', entity: AuditEntity },
      ],
    };

    const result = flattenRepositories(config);

    expect(result).toHaveLength(1);
    expect(result[0].module).toBe(TypeOrmRepositoryModule);
    expect(result[0].entities).toHaveLength(3);

    const keys = result[0].entities.map((e) => e.key);
    expect(keys).toEqual([USER_METADATA_MODULE_ENTITY_KEY, 'user', 'audit']);
  });

  it('separates entries with module override into their own group', () => {
    const config: RocketsRepositoriesConfig = {
      module: TypeOrmRepositoryModule,
      userMetadata: { entity: UserMetadataEntity },
      entities: [
        { key: 'user', entity: UserEntity },
        { key: 'audit', entity: AuditEntity, module: FakeFirestoreModule },
      ],
    };

    const result = flattenRepositories(config);

    expect(result).toHaveLength(2);

    const typeOrmGroup = result.find(
      (r) => r.module === TypeOrmRepositoryModule,
    ) as RepositoryPersistenceConfig;
    expect(typeOrmGroup.entities).toHaveLength(2);
    expect(typeOrmGroup.entities.map((e) => e.key)).toEqual([
      USER_METADATA_MODULE_ENTITY_KEY,
      'user',
    ]);

    const firestoreGroup = result.find(
      (r) => r.module === FakeFirestoreModule,
    ) as RepositoryPersistenceConfig;
    expect(firestoreGroup.entities).toHaveLength(1);
    expect(firestoreGroup.entities[0].key).toBe('audit');
  });

  it('allows userMetadata module override', () => {
    const config: RocketsRepositoriesConfig = {
      module: TypeOrmRepositoryModule,
      userMetadata: { entity: UserMetadataEntity, module: FakeFirestoreModule },
      entities: [{ key: 'user', entity: UserEntity }],
    };

    const result = flattenRepositories(config);

    expect(result).toHaveLength(2);

    const firestoreGroup = result.find(
      (r) => r.module === FakeFirestoreModule,
    ) as RepositoryPersistenceConfig;
    expect(firestoreGroup.entities[0].key).toBe(
      USER_METADATA_MODULE_ENTITY_KEY,
    );

    const typeOrmGroup = result.find(
      (r) => r.module === TypeOrmRepositoryModule,
    ) as RepositoryPersistenceConfig;
    expect(typeOrmGroup.entities[0].key).toBe('user');
  });

  it('returns only userMetadata when entities is empty', () => {
    const config: RocketsRepositoriesConfig = {
      module: TypeOrmRepositoryModule,
      userMetadata: { entity: UserMetadataEntity },
      entities: [],
    };

    const result = flattenRepositories(config);

    expect(result).toHaveLength(1);
    expect(result[0].entities).toHaveLength(1);
    expect(result[0].entities[0].key).toBe(USER_METADATA_MODULE_ENTITY_KEY);
  });
});
