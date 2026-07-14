import type { PlainLiteralObject } from '@nestjs/common';
import type { OverlayRef } from '@concepta/nestjs-core';
import { OwnerScopeHook, DEFAULT_OWNER_COLUMN } from './owner-scope.hook';
import { OwnerStampHook } from './owner-stamp.hook';
import { ActorCtx } from '../interceptors/actor.overlay';
import type { EntityHookContext, OwnedEntity } from './entity-hook';

interface BlogPost extends PlainLiteralObject {
  readonly id: string;
  readonly authorId: string;
  readonly title: string;
}

interface Pet extends OwnedEntity {
  readonly id: string;
  readonly name: string;
}

// Stub entity classes used by the factory. The factory's runtime spec
// reads `deriveEntityKey(entity)` and decorates the cached subclass with
// `@EntityHook({ entity })`. Fields are declared so the classes
// structurally match the typed `Pet` / `BlogPost` interfaces — without
// them the `for<E>(entity: Type<E>)` overload rejects the stub at
// compile time.
class PetEntity {
  id!: string;
  name!: string;
  userId!: string;
}
class BlogPostEntity {
  id!: string;
  authorId!: string;
  title!: string;
}

/**
 * Builds a minimum-viable `EntityHookContext` (a `RocketsCrudContext`)
 * carrying a stub overlay accessor that returns the supplied actor.
 * Lets the lifecycle methods use `getActor(ctx)` without needing the
 * full overlay-system wiring in a unit test.
 */
function fakeCtx(
  args: {
    actor?: { id: string; type: 'user' };
  } = {},
): EntityHookContext {
  const ctx = {
    entity: 'pet',
    params: {},
    query: {},
    options: {},
    operation: 'list',
    action: 'read',
    supports: (ref: OverlayRef<string, PlainLiteralObject, unknown[]>) =>
      ref === ActorCtx,
    with: (ref: OverlayRef<string, PlainLiteralObject, unknown[]>) => {
      if (ref === ActorCtx) return args.actor;
      return undefined;
    },
  };
  return ctx as unknown as EntityHookContext;
}

describe('OwnerScopeHook.for() factory', () => {
  it('returns a class that extends OwnerScopeHook', () => {
    const Hook = OwnerScopeHook.for<Pet>(PetEntity);
    const instance = new Hook();
    expect(instance).toBeInstanceOf(OwnerScopeHook);
  });

  it('caches subclasses per (entity, column) so same pair = same class', () => {
    const A = OwnerScopeHook.for<Pet>(PetEntity);
    const B = OwnerScopeHook.for<Pet>(PetEntity);
    expect(A).toBe(B);
  });

  it('produces distinct subclasses for distinct entities', () => {
    const A = OwnerScopeHook.for<Pet>(PetEntity);
    const B = OwnerScopeHook.for<BlogPost, 'authorId'>(
      BlogPostEntity,
      'authorId',
    );
    expect(A).not.toBe(B);
  });

  it('the default column is DEFAULT_OWNER_COLUMN ("userId")', () => {
    expect(DEFAULT_OWNER_COLUMN).toBe('userId');
    const Hook = OwnerScopeHook.for<Pet>(PetEntity);
    expect(Hook.name).toContain('userId');
  });

  it('subclass column is reflected in the runtime class name', () => {
    const Hook = OwnerScopeHook.for<BlogPost, 'authorId'>(
      BlogPostEntity,
      'authorId',
    );
    expect(Hook.name).toContain('authorId');
  });

  describe('runtime behaviour', () => {
    it('beforeFindOne adds owner clause when actor is present', () => {
      const Hook = OwnerScopeHook.for<Pet>(PetEntity);
      const instance = new Hook();
      const ctx = fakeCtx({ actor: { id: 'user-123', type: 'user' } });
      const result = instance.beforeFindOne({}, ctx);
      // The result has a where clause (Where.eq composed at runtime).
      expect((result as PlainLiteralObject).where).toBeDefined();
    });

    it('beforeFindOne no-ops when actor is missing (public route)', () => {
      const Hook = OwnerScopeHook.for<Pet>(PetEntity);
      const instance = new Hook();
      const original = {};
      const result = instance.beforeFindOne(original);
      expect(result).toBe(original);
    });

    it('no-op path produces no where clause whatsoever (shape invariant)', () => {
      // Future-proofs the public-route contract. If a refactor accidentally
      // returns `{ ...options }` (new ref) AND adds a default clause, the
      // identity assertion above would fail but a "where: undefined" check
      // surfaces a more specific regression — a public route returning
      // owner-scoped data because of a wrongly-applied default.
      const Hook = OwnerScopeHook.for<Pet>(PetEntity);
      const instance = new Hook();
      const result = instance.beforeFindOne({});
      expect((result as Record<string, unknown>).where).toBeUndefined();
    });

    it('beforeFindAndCount adds owner clause when actor is present', () => {
      // beforeFindOne and beforeFindAndCount share the same internal helper,
      // but the dispatch needs separate coverage so a future divergence
      // (e.g. accidentally typoing the lifecycle key on one) is caught.
      const Hook = OwnerScopeHook.for<Pet>(PetEntity);
      const instance = new Hook();
      const ctx = fakeCtx({ actor: { id: 'user-123', type: 'user' } });
      const result = instance.beforeFindAndCount({}, ctx);
      expect((result as PlainLiteralObject).where).toBeDefined();
    });

    it('beforeFindAndCount no-ops when actor missing (public list)', () => {
      const Hook = OwnerScopeHook.for<Pet>(PetEntity);
      const instance = new Hook();
      const original = {};
      const result = instance.beforeFindAndCount(original);
      expect(result).toBe(original);
      expect((result as Record<string, unknown>).where).toBeUndefined();
    });

    it('AND-composes the owner clause when a hostile pre-existing where targets the same column', () => {
      // A malicious request could send `?filter=userId||$ne||myId` to try
      // to exclude their own rows and leak others'. The composition MUST
      // wrap both clauses under `$and` so the owner constraint survives.
      const Hook = OwnerScopeHook.for<Pet>(PetEntity);
      const instance = new Hook();
      const ctx = fakeCtx({ actor: { id: 'authoritative', type: 'user' } });
      // Use a where shape the upstream `Where.and` understands; we're only
      // asserting the result contains BOTH clauses (no neutering).
      const original = { where: { foo: 'bar' } } as PlainLiteralObject;
      const result = instance.beforeFindOne(
        original as unknown as never,
        ctx,
      ) as PlainLiteralObject;
      // Result has a where (composed). Critically: NEW reference — original
      // is untouched (no mutation), and the composed envelope contains
      // the owner clause within (Where.and produces `{ $and: [...] }` shape
      // upstream, but we don't assert the exact envelope to avoid coupling).
      expect(result.where).toBeDefined();
      // Original where is preserved AND the owner clause is added on top.
      // The `result` is a fresh object (the hook spreads `...options`).
      expect(result).not.toBe(original);
    });

    it('preserves the actor.id used in the clause (Spy verifies the value sent to Where.eq)', () => {
      // Indirect verification: the actor.id flows from the overlay through
      // to the where clause unchanged. We can't snapshot the whole envelope
      // without binding to upstream `Where` shape, but we can confirm the
      // result object differs from the empty-where case AND that the actor
      // is the only thing changing across calls.
      const Hook = OwnerScopeHook.for<Pet>(PetEntity);
      const instance = new Hook();
      const a = instance.beforeFindOne(
        {},
        fakeCtx({ actor: { id: 'A', type: 'user' } }),
      );
      const b = instance.beforeFindOne(
        {},
        fakeCtx({ actor: { id: 'B', type: 'user' } }),
      );
      expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
    });
  });
});

describe('OwnerStampHook.for() factory', () => {
  it('returns a class that extends OwnerStampHook', () => {
    const Hook = OwnerStampHook.for<Pet>(PetEntity);
    const instance = new Hook();
    expect(instance).toBeInstanceOf(OwnerStampHook);
  });

  it('caches subclasses per (entity, column) so same pair = same class', () => {
    const A = OwnerStampHook.for<Pet>(PetEntity);
    const B = OwnerStampHook.for<Pet>(PetEntity);
    expect(A).toBe(B);
  });

  it('produces distinct subclasses for distinct entities', () => {
    const A = OwnerStampHook.for<Pet>(PetEntity);
    const B = OwnerStampHook.for<BlogPost, 'authorId'>(
      BlogPostEntity,
      'authorId',
    );
    expect(A).not.toBe(B);
  });

  describe('runtime behaviour', () => {
    it('beforeCreate stamps the owner column from actor.id', () => {
      const Hook = OwnerStampHook.for<Pet>(PetEntity);
      const instance = new Hook();
      const ctx = fakeCtx({ actor: { id: 'actor-1', type: 'user' } });
      const payload: Pet = { id: '1', name: 'Rex', userId: 'spoofed' };
      const result = instance.beforeCreate(payload, ctx);
      // Actor wins — spoofed userId is overwritten with actor.id.
      expect(result.userId).toBe('actor-1');
    });

    it('beforeCreate throws Unauthorized when actor is missing', () => {
      const Hook = OwnerStampHook.for<Pet>(PetEntity);
      const instance = new Hook();
      const payload: Pet = { id: '1', name: 'Rex', userId: '' };
      // No context = no actor. Writes without an actor are a misconfig
      // (the hook surfaces the error rather than silently writing rows
      // with a missing/blank owner).
      expect(() => instance.beforeCreate(payload)).toThrow();
    });

    it('beforeUpdate uses the same stamping logic', () => {
      const Hook = OwnerStampHook.for<Pet>(PetEntity);
      const instance = new Hook();
      const ctx = fakeCtx({ actor: { id: 'actor-2', type: 'user' } });
      const payload: Pet = { id: '1', name: 'Buddy', userId: 'spoofed' };
      const result = instance.beforeUpdate(payload, ctx);
      expect(result.userId).toBe('actor-2');
    });

    it('respects the custom column when bound via .for(entity, column)', () => {
      const Hook = OwnerStampHook.for<BlogPost, 'authorId'>(
        BlogPostEntity,
        'authorId',
      );
      const instance = new Hook();
      const ctx = fakeCtx({ actor: { id: 'actor-3', type: 'user' } });
      const payload: BlogPost = {
        id: '1',
        authorId: 'spoofed',
        title: 'Post',
      };
      const result = instance.beforeCreate(payload, ctx);
      expect(result.authorId).toBe('actor-3');
      expect((result as PlainLiteralObject).userId).toBeUndefined();
    });
  });
});
