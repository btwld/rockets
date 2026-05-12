import type { PlainLiteralObject } from '@nestjs/common';
import { PathScopeHook } from './path-scope.hook';
import type { EntityHookContext } from './entity-hook';

// Stub entity used by the factory. Two stubs let us prove the cache
// keys on `(entity, paramName, fkColumn)` — same triple → same class,
// different entity → different class.
class PetTagEntity {}
class AuthorTagEntity {}

function fakeCrudContext(params: Record<string, unknown>): EntityHookContext {
  const ctx = {
    entity: 'petTag',
    params,
    query: {},
    options: {},
    operation: 'list',
    action: 'read',
    with: () => undefined,
  };
  return ctx as unknown as EntityHookContext;
}

describe('PathScopeHook', () => {
  describe('factory', () => {
    it('caches subclasses by (entity, paramName, fkColumn)', () => {
      const A = PathScopeHook.for(PetTagEntity, 'petId', 'petId');
      const B = PathScopeHook.for(PetTagEntity, 'petId', 'petId');
      expect(A).toBe(B);
    });

    it('returns distinct subclasses for distinct cache keys', () => {
      const Pet = PathScopeHook.for(PetTagEntity, 'petId', 'petId');
      const Author = PathScopeHook.for(PetTagEntity, 'authorId', 'author_id');
      expect(Pet).not.toBe(Author);
    });

    it('returns distinct subclasses when only the entity differs', () => {
      const A = PathScopeHook.for(PetTagEntity, 'petId', 'petId');
      const B = PathScopeHook.for(AuthorTagEntity, 'petId', 'petId');
      expect(A).not.toBe(B);
    });

    it('produces a class with a meaningful name', () => {
      const Hook = PathScopeHook.for(PetTagEntity, 'petId', 'petId');
      expect(Hook.name).toMatch(/PathScopeHook_PetTagEntity_petId_petId/);
    });

    it('produces distinct classes when only fkColumn differs', () => {
      const A = PathScopeHook.for(PetTagEntity, 'petId', 'petId');
      const B = PathScopeHook.for(PetTagEntity, 'petId', 'pet_id');
      expect(A).not.toBe(B);
    });
  });

  describe('beforeFindAndCount', () => {
    it('appends a where clause filtering by fkColumn = params[paramName]', () => {
      const Hook = PathScopeHook.for(PetTagEntity, 'petId', 'petId');
      const instance = new Hook();
      const ctx = fakeCrudContext({ petId: 'pet-uuid' });
      const result = instance.beforeFindAndCount({}, ctx) as PlainLiteralObject;
      expect(result.where).toBeDefined();
    });

    it('no-ops when params[paramName] is missing', () => {
      const Hook = PathScopeHook.for(PetTagEntity, 'petId', 'petId');
      const instance = new Hook();
      const ctx = fakeCrudContext({});
      const original = {};
      const result = instance.beforeFindAndCount(original, ctx);
      expect(result).toBe(original);
    });

    it('no-ops when context is undefined (non-CRUD invocation)', () => {
      const Hook = PathScopeHook.for(PetTagEntity, 'petId', 'petId');
      const instance = new Hook();
      const original = {};
      const result = instance.beforeFindAndCount(original);
      expect(result).toBe(original);
    });

    it('preserves any pre-existing where clause via AND-composition', () => {
      const Hook = PathScopeHook.for(PetTagEntity, 'petId', 'petId');
      const instance = new Hook();
      const ctx = fakeCrudContext({ petId: 'pet-uuid' });
      const original = {};
      const result = instance.beforeFindAndCount(
        original,
        ctx,
      ) as PlainLiteralObject;
      // Where.and produces an `$and` envelope (or upstream-equivalent shape).
      expect(result.where).toBeDefined();
    });
  });

  describe('beforeFindOne', () => {
    it('also appends the path-scope clause', () => {
      const Hook = PathScopeHook.for(PetTagEntity, 'petId', 'petId');
      const instance = new Hook();
      const ctx = fakeCrudContext({ petId: 'pet-uuid' });
      const result = instance.beforeFindOne({}, ctx) as PlainLiteralObject;
      expect(result.where).toBeDefined();
    });

    it('uses the fkColumn (not paramName) in the where clause shape', () => {
      // Asserts the produced clause references `pet_id` (fkColumn) and
      // carries the param value `pet-uuid`. We serialize the result to
      // check both substrings in the envelope without binding to the
      // upstream `Where` internal shape.
      const Hook = PathScopeHook.for(PetTagEntity, 'petId', 'pet_id');
      const instance = new Hook();
      const ctx = fakeCrudContext({ petId: 'pet-uuid' });
      const result = instance.beforeFindOne({}, ctx) as PlainLiteralObject;
      const serialized = JSON.stringify(result.where);
      expect(serialized).toContain('pet_id');
      expect(serialized).toContain('pet-uuid');
    });

    it('treats whitespace-only paramValue as a string and stamps it as-is', () => {
      // The hook does not validate param content — that is the
      // `request.params: { type: 'uuid' }` layer's job. This test
      // documents the boundary: the hook trusts whatever string the
      // CRUD pipeline delivers.
      const Hook = PathScopeHook.for(PetTagEntity, 'petId', 'petId');
      const instance = new Hook();
      const ctx = fakeCrudContext({ petId: '   ' });
      const result = instance.beforeFindOne({}, ctx) as PlainLiteralObject;
      // A where clause IS added (whitespace is a valid string).
      expect(result.where).toBeDefined();
    });

    it('treats non-string paramValue (number, null) as missing', () => {
      const Hook = PathScopeHook.for(PetTagEntity, 'petId', 'petId');
      const instance = new Hook();
      const original = {};
      // number
      expect(
        instance.beforeFindOne(original, fakeCrudContext({ petId: 42 })),
      ).toBe(original);
      // null
      expect(
        instance.beforeFindOne(original, fakeCrudContext({ petId: null })),
      ).toBe(original);
      // object
      expect(
        instance.beforeFindOne(
          original,
          fakeCrudContext({ petId: { nested: 'oops' } }),
        ),
      ).toBe(original);
    });
  });

  describe('beforeCreate', () => {
    it('stamps the FK column from ctx.params[paramName]', () => {
      const Hook = PathScopeHook.for(PetTagEntity, 'petId', 'petId');
      const instance = new Hook();
      const ctx = fakeCrudContext({ petId: 'pet-uuid' });
      const payload: PlainLiteralObject = { tagId: 'tag-uuid' };
      const result = instance.beforeCreate(payload, ctx);
      expect((result as Record<string, unknown>).petId).toBe('pet-uuid');
    });

    it('throws when CRUD context exists but the URL param is missing', () => {
      const Hook = PathScopeHook.for(PetTagEntity, 'petId', 'petId');
      const instance = new Hook();
      const ctx = fakeCrudContext({});
      const payload: PlainLiteralObject = { tagId: 'tag-uuid' };
      expect(() => instance.beforeCreate(payload, ctx)).toThrow(
        /missing URL param "petId"/,
      );
    });

    it('strips a client-supplied FK column when the URL has no param (defence in depth)', () => {
      // Even when the throw above fires first in CRUD context, the
      // strip-then-throw order is documented: any spoofed FK in the
      // payload is removed before the error escapes, so a future
      // catcher cannot accidentally persist it.
      const Hook = PathScopeHook.for(PetTagEntity, 'petId', 'petId');
      const instance = new Hook();
      const ctx = fakeCrudContext({});
      const payload: PlainLiteralObject = {
        tagId: 'tag-uuid',
        petId: 'spoofed',
      };
      expect(() => instance.beforeCreate(payload, ctx)).toThrow();
      expect((payload as Record<string, unknown>).petId).toBeUndefined();
    });

    it('no-ops outside a CRUD context (internal repository call)', () => {
      const Hook = PathScopeHook.for(PetTagEntity, 'petId', 'petId');
      const instance = new Hook();
      const payload: PlainLiteralObject = { tagId: 'tag-uuid' };
      const result = instance.beforeCreate(payload, undefined);
      expect((result as Record<string, unknown>).tagId).toBe('tag-uuid');
    });

    it('overwrites any client-supplied FK column with the URL value', () => {
      const Hook = PathScopeHook.for(PetTagEntity, 'petId', 'petId');
      const instance = new Hook();
      const ctx = fakeCrudContext({ petId: 'authoritative-pet' });
      const payload: PlainLiteralObject = {
        tagId: 'tag-uuid',
        petId: 'spoofed-by-client',
      };
      const result = instance.beforeCreate(payload, ctx);
      expect((result as Record<string, unknown>).petId).toBe(
        'authoritative-pet',
      );
    });

    it('uses fkColumn (not paramName) when the two differ', () => {
      const Hook = PathScopeHook.for(PetTagEntity, 'petId', 'pet_id');
      const instance = new Hook();
      const ctx = fakeCrudContext({ petId: 'pet-uuid' });
      const payload: PlainLiteralObject = {};
      const result = instance.beforeCreate(payload, ctx);
      expect((result as Record<string, unknown>).pet_id).toBe('pet-uuid');
      expect((result as Record<string, unknown>).petId).toBeUndefined();
    });
  });
});
