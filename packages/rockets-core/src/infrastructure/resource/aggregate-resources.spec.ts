import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import { TypeOrmRepositoryModule } from '@concepta/nestjs-repository-typeorm';
import type { RepositoryPersistenceConfig } from '../../domain/interfaces/repository-persistence.interface';
import { defineResource } from './define-resource';
import {
  aggregateResources,
  isRocketsResourceBundle,
} from './aggregate-resources';

@Entity('pets_t')
class PetEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  name!: string;
}

@Entity('vaccinations_t')
class VaccinationEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  label!: string;
}

describe('isRocketsResourceBundle', () => {
  it('returns true for a defineResource() result', () => {
    const bundle = defineResource({
      key: 'pet',
      path: 'pet',
      tags: ['pet'],
      entity: PetEntity,
    });
    expect(isRocketsResourceBundle(bundle)).toBe(true);
  });

  it('returns false for a raw RocketsResourceConfig', () => {
    const raw = {
      crud: { controller: { path: 'x', entity: 'x' }, operations: [] },
    };
    expect(isRocketsResourceBundle(raw)).toBe(false);
  });
});

describe('aggregateResources', () => {
  describe('basic wiring', () => {
    it('returns empty arrays when no resources are passed', () => {
      const result = aggregateResources({ resources: [] });
      expect(result.resources).toEqual([]);
      expect(result.repositoryPersistence).toEqual([]);
    });

    it('extracts bundle.core into resources', () => {
      const pet = defineResource({
        key: 'pet',
        path: 'pet',
        tags: ['pet'],
        entity: PetEntity,
      });
      const result = aggregateResources({ resources: [pet] });
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
      const result = aggregateResources({ resources: [pet, vac] });

      expect(result.repositoryPersistence).toHaveLength(1);
      const persistence = result
        .repositoryPersistence[0] as RepositoryPersistenceConfig;
      expect(persistence.module).toBe(TypeOrmRepositoryModule);
      expect(persistence.entities).toHaveLength(2);
      const keys = persistence.entities.map((e) => e.key);
      expect(keys).toEqual(expect.arrayContaining(['pet', 'vaccination']));
    });
  });

  describe('raw config passthrough', () => {
    it('passes raw configs into resources but does not contribute persistence', () => {
      const raw = {
        crud: { controller: { path: 'x', entity: 'x' }, operations: [] },
      };
      const result = aggregateResources({ resources: [raw] });
      expect(result.resources).toContain(raw);
      expect(result.repositoryPersistence).toEqual([]);
    });

    it('mixes bundle + raw inputs correctly', () => {
      const pet = defineResource({
        key: 'pet',
        path: 'pet',
        tags: ['pet'],
        entity: PetEntity,
      });
      const raw = {
        crud: { controller: { path: 'x', entity: 'x' }, operations: [] },
      };
      const result = aggregateResources({ resources: [pet, raw] });

      // Bundles come first, then raw
      expect(result.resources[0]).toBe(pet.core);
      expect(result.resources[1]).toBe(raw);
    });
  });

  describe('entity dedup', () => {
    it('dedupes two bundles referencing the same entity class', () => {
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
      const result = aggregateResources({ resources: [first, second] });
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
      expect(() => aggregateResources({ resources: [first, second] })).toThrow(
        /conflicting keys/,
      );
    });

    it('throws when two bundles declare conflicting relations config', () => {
      const first = defineResource({
        key: 'pet',
        entity: PetEntity,
        path: 'pet',
        tags: ['pet'],
        relations: [{ target: 'owner', federated: true }],
      });
      const second = defineResource({
        key: 'pet',
        entity: PetEntity,
        path: 'pet',
        tags: ['pet'],
        relations: [{ target: 'owner', federated: false }],
      });
      expect(() => aggregateResources({ resources: [first, second] })).toThrow(
        /conflicting `relations`/,
      );
    });
  });

  describe('relation target validation', () => {
    it('accepts a relation whose `target` string matches a registered bundle key', () => {
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
        relations: [{ target: 'vaccination', propertyName: 'vaccinations' }],
      });
      expect(() => aggregateResources({ resources: [pet, vac] })).not.toThrow();
    });

    it('throws when a relation `target` points at an unregistered key', () => {
      const pet = defineResource({
        key: 'pet',
        entity: PetEntity,
        path: 'pet',
        tags: ['pet'],
        relations: [{ target: 'vaccination', propertyName: 'vaccinations' }],
      });
      expect(() => aggregateResources({ resources: [pet] })).toThrow(
        /targets resource "vaccination" which is not registered/,
      );
    });

    it('includes the offending propertyName in the diagnostic', () => {
      const pet = defineResource({
        key: 'pet',
        entity: PetEntity,
        path: 'pet',
        tags: ['pet'],
        relations: [{ target: 'audit', propertyName: 'history' }],
      });
      expect(() => aggregateResources({ resources: [pet] })).toThrow(
        /relation "history"/,
      );
    });
  });
});
