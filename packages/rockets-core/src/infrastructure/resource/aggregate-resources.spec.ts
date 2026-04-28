import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import { TypeOrmRepositoryModule } from '@concepta/nestjs-repository-typeorm';
import type { RepositoryPersistenceConfig } from '../../domain/interfaces/repository-persistence.interface';
import { defineResource } from './define-resource';
import { relation } from './relation';
import {
  prepareResourceRegistration,
  isGeneratedResourceDefinition,
} from './aggregate-resources';

@Entity('pets_t')
class PetEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  name!: string;

  // Relation properties for the typed `relation()` calls below.
  vaccinations?: VaccinationEntity[];
  owner?: OwnerEntity;
  parent?: PetEntity;
  history?: AuditEntity[];
}

@Entity('vaccinations_t')
class VaccinationEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  label!: string;
}

// Standalone classes used to exercise the entity index. They are NOT
// declared as TypeORM entities so they can stand in for either a generated
// resource target, a `repositories.entities` entry, or a missing registration.
class OwnerEntity {
  id!: string;
}
class AuditEntity {
  id!: string;
}
class UserMetadataEntity {
  id!: string;
}

describe('isGeneratedResourceDefinition', () => {
  it('returns true for a defineResource() result', () => {
    const bundle = defineResource({
      key: 'pet',
      path: 'pet',
      tags: ['pet'],
      entity: PetEntity,
    });
    expect(isGeneratedResourceDefinition(bundle)).toBe(true);
  });

  it('returns false for a manual RocketsResourceConfig', () => {
    const raw = {
      crud: { controller: { path: 'x', entity: 'x' }, operations: [] },
    };
    expect(isGeneratedResourceDefinition(raw)).toBe(false);
  });
});

describe('prepareResourceRegistration', () => {
  describe('basic wiring', () => {
    it('returns empty arrays when no resources are passed', () => {
      const result = prepareResourceRegistration({ resourceDefinitions: [] });
      expect(result.resources).toEqual([]);
      expect(result.repositoryPersistence).toEqual([]);
    });

    it('extracts generated resource core into resources', () => {
      const pet = defineResource({
        key: 'pet',
        path: 'pet',
        tags: ['pet'],
        entity: PetEntity,
      });
      const result = prepareResourceRegistration({
        resourceDefinitions: [pet],
      });
      expect(result.resources).toHaveLength(1);
      expect(result.resources[0]).toBe(pet.core);
    });

    it('groups entities by module into one persistence entry per adapter', () => {
      const pet = defineResource({
        key: 'pet',
        path: 'pet',
        tags: ['pet'],
        entity: PetEntity,
      });
      const vac = defineResource({
        key: 'vaccination',
        entity: VaccinationEntity,
        path: 'vaccination',
        tags: ['vaccination'],
      });
      const result = prepareResourceRegistration({
        resourceDefinitions: [pet, vac],
      });

      expect(result.repositoryPersistence).toHaveLength(1);
      const persistence = result
        .repositoryPersistence[0] as RepositoryPersistenceConfig;
      expect(persistence.module).toBe(TypeOrmRepositoryModule);
      expect(persistence.entities).toHaveLength(2);
      const keys = persistence.entities.map((e) => e.key);
      expect(keys).toEqual(expect.arrayContaining(['pet', 'vaccination']));
    });
  });

  describe('manual config passthrough', () => {
    it('passes manual configs into resources but does not contribute persistence', () => {
      const raw = {
        crud: { controller: { path: 'x', entity: 'x' }, operations: [] },
      };
      const result = prepareResourceRegistration({
        resourceDefinitions: [raw],
      });
      expect(result.resources).toContain(raw);
      expect(result.repositoryPersistence).toEqual([]);
    });

    it('mixes generated + manual resource definitions correctly', () => {
      const pet = defineResource({
        key: 'pet',
        path: 'pet',
        tags: ['pet'],
        entity: PetEntity,
      });
      const raw = {
        crud: { controller: { path: 'x', entity: 'x' }, operations: [] },
      };
      const result = prepareResourceRegistration({
        resourceDefinitions: [pet, raw],
      });

      expect(result.resources[0]).toBe(pet.core);
      expect(result.resources[1]).toBe(raw);
    });
  });

  describe('entity dedup', () => {
    it('dedupes two generated resources referencing the same entity class', () => {
      const first = defineResource({
        key: 'pet',
        path: 'pet',
        tags: ['pet'],
        entity: PetEntity,
      });
      const second = defineResource({
        key: 'pet',
        path: 'pet',
        tags: ['pet'],
        entity: PetEntity,
      });
      const result = prepareResourceRegistration({
        resourceDefinitions: [first, second],
      });
      const persistence = result
        .repositoryPersistence[0] as RepositoryPersistenceConfig;
      expect(persistence.entities).toHaveLength(1);
    });

    it('throws when the same entity is registered under different keys', () => {
      const first = defineResource({
        key: 'pet',
        path: 'pet',
        tags: ['pet'],
        entity: PetEntity,
      });
      const second = defineResource({
        key: 'animal',
        path: 'animal',
        tags: ['animal'],
        entity: PetEntity,
      });
      expect(() =>
        prepareResourceRegistration({ resourceDefinitions: [first, second] }),
      ).toThrow(/conflicting keys/);
    });

    it('throws when two generated resources declare conflicting relations config', () => {
      const first = defineResource({
        key: 'pet',
        entity: PetEntity,
        path: 'pet',
        tags: ['pet'],
        relations: [
          relation(PetEntity, OwnerEntity, 'owner', { federated: true }),
        ],
      });
      const second = defineResource({
        key: 'pet',
        entity: PetEntity,
        path: 'pet',
        tags: ['pet'],
        relations: [
          relation(PetEntity, OwnerEntity, 'owner', { federated: false }),
        ],
      });
      expect(() =>
        prepareResourceRegistration({
          resourceDefinitions: [first, second],
          // Owner must be registered for the relation target lookup not
          // to short-circuit before we hit the conflicting-config path.
          repositories: {
            module: TypeOrmRepositoryModule,
            userMetadata: { entity: UserMetadataEntity },
            entities: [{ key: 'owner', entity: OwnerEntity }],
          },
        }),
      ).toThrow(/conflicting `relations`/);
    });
  });

  describe('cross-resource relation resolution', () => {
    it('resolves a relation target that points at another generated resource', () => {
      const vac = defineResource({
        key: 'vaccination',
        entity: VaccinationEntity,
        path: 'vaccination',
        tags: ['vaccination'],
      });
      const pet = defineResource({
        key: 'pet',
        entity: PetEntity,
        path: 'pet',
        tags: ['pet'],
        relations: [relation(PetEntity, VaccinationEntity, 'vaccinations')],
      });
      expect(() =>
        prepareResourceRegistration({ resourceDefinitions: [pet, vac] }),
      ).not.toThrow();
    });

    it('resolves a relation target that lives in repositories.entities (no generated resource for it)', () => {
      const pet = defineResource({
        key: 'pet',
        entity: PetEntity,
        path: 'pet',
        tags: ['pet'],
        relations: [relation(PetEntity, OwnerEntity, 'owner')],
      });
      expect(() =>
        prepareResourceRegistration({
          resourceDefinitions: [pet],
          repositories: {
            module: TypeOrmRepositoryModule,
            userMetadata: { entity: UserMetadataEntity },
            entities: [{ key: 'owner', entity: OwnerEntity }],
          },
        }),
      ).not.toThrow();
    });

    it('resolves a relation target supplied via a () => Class thunk', () => {
      const vac = defineResource({
        key: 'vaccination',
        entity: VaccinationEntity,
        path: 'vaccination',
        tags: ['vaccination'],
      });
      const pet = defineResource({
        key: 'pet',
        entity: PetEntity,
        path: 'pet',
        tags: ['pet'],
        relations: [
          relation(PetEntity, () => VaccinationEntity, 'vaccinations'),
        ],
      });
      expect(() =>
        prepareResourceRegistration({ resourceDefinitions: [pet, vac] }),
      ).not.toThrow();
    });

    it('resolves self-referential relations (parent: PetEntity)', () => {
      const pet = defineResource({
        key: 'pet',
        entity: PetEntity,
        path: 'pet',
        tags: ['pet'],
        relations: [relation(PetEntity, PetEntity, 'parent')],
      });
      expect(() =>
        prepareResourceRegistration({ resourceDefinitions: [pet] }),
      ).not.toThrow();
    });

    it('throws with the entity name when the target is not registered anywhere', () => {
      const pet = defineResource({
        key: 'pet',
        entity: PetEntity,
        path: 'pet',
        tags: ['pet'],
        relations: [relation(PetEntity, AuditEntity, 'history')],
      });
      expect(() =>
        prepareResourceRegistration({ resourceDefinitions: [pet] }),
      ).toThrow(
        /relation "history".*targets entity `AuditEntity` which is not registered/,
      );
    });
  });

  describe('single-key invariant across generated resources + repositories', () => {
    it('throws when an entity is registered under one key in a generated resource and another in repositories.entities', () => {
      const pet = defineResource({
        key: 'pet',
        entity: PetEntity,
        path: 'pet',
        tags: ['pet'],
      });
      expect(() =>
        prepareResourceRegistration({
          resourceDefinitions: [pet],
          repositories: {
            module: TypeOrmRepositoryModule,
            userMetadata: { entity: UserMetadataEntity },
            entities: [{ key: 'animal', entity: PetEntity }],
          },
        }),
      ).toThrow(/conflicting keys.*"pet" and "animal"/);
    });

    it('accepts identical key in both registrations (idempotent)', () => {
      const pet = defineResource({
        key: 'pet',
        entity: PetEntity,
        path: 'pet',
        tags: ['pet'],
      });
      expect(() =>
        prepareResourceRegistration({
          resourceDefinitions: [pet],
          repositories: {
            module: TypeOrmRepositoryModule,
            userMetadata: { entity: UserMetadataEntity },
            entities: [{ key: 'pet', entity: PetEntity }],
          },
        }),
      ).not.toThrow();
    });
  });
});
