import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import {
  defaultParentParam,
  defineSubResource,
  isSubResourceDefinition,
} from './define-sub-resource';
import { ResourceKind } from '../../domain/interfaces/resource-kind.enum';

@Entity('pet_tags')
class PetTagEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  petId!: string;

  @Column({ type: 'uuid' })
  tagId!: string;
}

class PetTagDto {
  id!: string;
}

describe('defineSubResource', () => {
  describe('input validation', () => {
    it('throws when explicit key is empty', () => {
      expect(() =>
        defineSubResource({
          key: '',
          entity: PetTagEntity,
        }),
      ).toThrow(/`key` must be a non-empty string/);
    });

    it('throws when entity is not a class constructor', () => {
      expect(() =>
        defineSubResource({
          key: 'petTag',
          // @ts-expect-error — runtime validation test
          entity: { not: 'a class' },
        }),
      ).toThrow(/must be a class constructor/);
    });

    it('forwards inner key as undefined when omitted (parent will derive)', () => {
      const sub = defineSubResource({ entity: PetTagEntity });
      expect(sub.definition.key).toBeUndefined();
      expect(sub.definition.entity).toBe(PetTagEntity);
    });
  });

  describe('output shape', () => {
    it('returns a branded sub-resource definition', () => {
      const sub = defineSubResource({
        key: 'petTag',
        entity: PetTagEntity,
      });
      expect(sub.kind).toBe(ResourceKind.Sub);
      expect(isSubResourceDefinition(sub)).toBe(true);
    });

    it('preserves operations / hooks / dto on the inner definition', () => {
      const sub = defineSubResource({
        key: 'petTag',
        entity: PetTagEntity,
        operations: {
          list: { output: PetTagDto },
          create: { input: PetTagDto, output: PetTagDto },
        },
      });
      expect(sub.definition.key).toBe('petTag');
      expect(sub.definition.entity).toBe(PetTagEntity);
      // `operations` is forwarded as-is (the parent's defineResource will normalize).
      expect(sub.definition.operations).toBeDefined();
    });

    it('forwards parentKey when provided', () => {
      const sub = defineSubResource({
        key: 'petTag',
        entity: PetTagEntity,
        parentKey: 'parentPetId',
      });
      expect(sub.parentKey).toBe('parentPetId');
    });

    it('forwards parentPk when provided', () => {
      const sub = defineSubResource({
        key: 'petTag',
        entity: PetTagEntity,
        parentPk: 'companyId',
      });
      expect(sub.parentPk).toBe('companyId');
    });

    it('forwards segment when provided', () => {
      const sub = defineSubResource({
        key: 'petTag',
        entity: PetTagEntity,
        segment: 'tags',
      });
      expect(sub.segment).toBe('tags');
    });

    it('forwards owner when provided', () => {
      const sub = defineSubResource({
        key: 'petTag',
        entity: PetTagEntity,
        owner: 'orgId',
      });
      expect(sub.owner).toBe('orgId');
    });

    it('forwards owner=false when provided', () => {
      const sub = defineSubResource({
        key: 'petTag',
        entity: PetTagEntity,
        owner: false,
      });
      expect(sub.owner).toBe(false);
    });

    it('forwards reloadAfterCreate when provided', () => {
      const sub = defineSubResource({
        key: 'petTag',
        entity: PetTagEntity,
        reloadAfterCreate: true,
      });
      expect(sub.reloadAfterCreate).toBe(true);
    });

    it('omits optional fields from the sub object when not provided', () => {
      const sub = defineSubResource({
        key: 'petTag',
        entity: PetTagEntity,
      });
      expect('parentKey' in sub).toBe(false);
      expect('parentPk' in sub).toBe(false);
      expect('segment' in sub).toBe(false);
      expect('owner' in sub).toBe(false);
      expect('scope' in sub).toBe(false);
      expect('reloadAfterCreate' in sub).toBe(false);
    });
  });
});

describe('isSubResourceDefinition', () => {
  it('returns true for a defineSubResource() output', () => {
    const sub = defineSubResource({
      key: 'petTag',
      entity: PetTagEntity,
    });
    expect(isSubResourceDefinition(sub)).toBe(true);
  });

  it('returns false for an object without the kind discriminator', () => {
    expect(isSubResourceDefinition({ key: 'petTag' })).toBe(false);
    expect(isSubResourceDefinition(null)).toBe(false);
    expect(isSubResourceDefinition(undefined)).toBe(false);
    expect(isSubResourceDefinition('string')).toBe(false);
    expect(isSubResourceDefinition(42)).toBe(false);
  });

  it('returns false for a wrong-kind object', () => {
    expect(isSubResourceDefinition({ kind: ResourceKind.Crud })).toBe(false);
    expect(isSubResourceDefinition({ kind: ResourceKind.Module })).toBe(false);
    expect(isSubResourceDefinition({ kind: 'something-else' })).toBe(false);
  });

  it('the defineSubResource() output carries the correct kind discriminator', () => {
    const sub = defineSubResource({
      key: 'petTag',
      entity: PetTagEntity,
    });
    expect(sub.kind).toBe(ResourceKind.Sub);
  });
});

describe('defaultParentParam', () => {
  it('appends "Id" to the parent key', () => {
    expect(defaultParentParam('pet')).toBe('petId');
    expect(defaultParentParam('user')).toBe('userId');
    expect(defaultParentParam('categoryAddress')).toBe('categoryAddressId');
  });
});
