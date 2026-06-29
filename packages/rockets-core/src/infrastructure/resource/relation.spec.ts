import { Where } from '@concepta/nestjs-repository';
import {
  createBoundRelation,
  relation,
  resolveRelationTarget,
} from './relation';

// ────────────────────────────────────────────────────────────────────
// Fixtures — minimal entity classes. Relation properties are typed so
// the `keyof Source` constraint on `propertyName` has something to bite.
// ────────────────────────────────────────────────────────────────────

class PetEntity {
  id!: string;
  vaccinations?: PetVaccinationEntity[];
  owner?: OwnerEntity;
  parent?: PetEntity;
}

class PetVaccinationEntity {
  id!: string;
  pet?: PetEntity;
}

class OwnerEntity {
  id!: string;
}

describe('relation (standalone)', () => {
  it('returns a relation entry with source/target/propertyName', () => {
    const entry = relation(PetEntity, PetVaccinationEntity, 'vaccinations');
    expect(entry).toEqual({
      source: PetEntity,
      target: PetVaccinationEntity,
      propertyName: 'vaccinations',
    });
  });

  it('preserves a `() => Class` thunk target verbatim (no eager resolution)', () => {
    const thunk = () => PetEntity;
    const entry = relation(PetVaccinationEntity, thunk, 'pet');
    expect(entry.target).toBe(thunk);
    expect(typeof entry.target).toBe('function');
  });

  it('forwards federated/distinctFilter/include only when provided', () => {
    const bare = relation(PetEntity, OwnerEntity, 'owner');
    expect(bare).not.toHaveProperty('federated');
    expect(bare).not.toHaveProperty('distinctFilter');
    expect(bare).not.toHaveProperty('include');

    const filter = Where.eq('id', 'x');
    const full = relation(PetEntity, OwnerEntity, 'owner', {
      federated: true,
      distinctFilter: filter,
      include: 'never',
    });
    expect(full.federated).toBe(true);
    expect(full.distinctFilter).toBe(filter);
    expect(full.include).toBe('never');
  });
});

describe('createBoundRelation', () => {
  it('returns a function that captures the source class', () => {
    const boundPet = createBoundRelation(PetEntity);
    const entry = boundPet(PetVaccinationEntity, 'vaccinations');
    expect(entry.source).toBe(PetEntity);
  });

  it('produces entries equal to standalone relation() with the same arguments', () => {
    const boundPet = createBoundRelation(PetEntity);
    const fromBound = boundPet(OwnerEntity, 'owner', { federated: true });
    const fromStandalone = relation(PetEntity, OwnerEntity, 'owner', {
      federated: true,
    });
    expect(fromBound).toEqual(fromStandalone);
  });

  it('accepts a `() => Class` thunk target without eager evaluation', () => {
    const boundVaccination = createBoundRelation(PetVaccinationEntity);
    const thunk = () => PetEntity;
    const entry = boundVaccination(thunk, 'pet');
    expect(entry.source).toBe(PetVaccinationEntity);
    expect(entry.target).toBe(thunk);
  });

  it('supports self-references via thunk (source === target)', () => {
    const boundPet = createBoundRelation(PetEntity);
    const entry = boundPet(() => PetEntity, 'parent');
    expect(entry.source).toBe(PetEntity);
    expect(resolveRelationTarget(entry)).toBe(PetEntity);
  });

  it('forwards options without inventing keys when none are supplied', () => {
    const boundPet = createBoundRelation(PetEntity);
    const entry = boundPet(OwnerEntity, 'owner');
    expect(Object.keys(entry).sort()).toEqual(
      ['propertyName', 'source', 'target'].sort(),
    );
  });

  it('returns independent functions for independent sources', () => {
    const boundA = createBoundRelation(PetEntity);
    const boundB = createBoundRelation(PetVaccinationEntity);
    expect(boundA(OwnerEntity, 'owner').source).toBe(PetEntity);
    expect(boundB(() => PetEntity, 'pet').source).toBe(PetVaccinationEntity);
  });

  it('produces an entry resolvable via resolveRelationTarget', () => {
    const boundPet = createBoundRelation(PetEntity);
    const entry = boundPet(PetVaccinationEntity, 'vaccinations');
    expect(resolveRelationTarget(entry)).toBe(PetVaccinationEntity);
  });
});

// ────────────────────────────────────────────────────────────────────
// Type-level guards. These blocks must FAIL to compile if the bound
// helper ever loses its source narrowing — keeping the tests honest
// about the compile-time guarantees we ship.
// ────────────────────────────────────────────────────────────────────

describe('createBoundRelation — compile-time guarantees', () => {
  it('rejects propertyName that is not keyof S (compile-time)', () => {
    const boundVaccination = createBoundRelation(PetVaccinationEntity);
    // @ts-expect-error 'wrongProp' is not assignable to keyof PetVaccinationEntity
    boundVaccination(PetEntity, 'wrongProp');
  });

  it('rejects propertyName whose key exists on a different entity', () => {
    const boundVaccination = createBoundRelation(PetVaccinationEntity);
    // 'vaccinations' is keyof PetEntity, NOT keyof PetVaccinationEntity.
    // @ts-expect-error keyof is bound to PetVaccinationEntity, not PetEntity
    boundVaccination(PetEntity, 'vaccinations');
  });

  it('does not accept a `source` argument (the bound API has no source slot)', () => {
    const boundPet = createBoundRelation(PetEntity);
    // @ts-expect-error bound relation takes (target, propertyName, options?) — no source
    boundPet(PetEntity, PetVaccinationEntity, 'vaccinations');
  });

  it('accepts every valid keyof S without complaint', () => {
    const boundPet = createBoundRelation(PetEntity);
    boundPet(PetVaccinationEntity, 'vaccinations');
    boundPet(OwnerEntity, 'owner');
    boundPet(() => PetEntity, 'parent');
  });
});
