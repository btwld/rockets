import type { PlainLiteralObject } from '@nestjs/common';
import { OwnerStampHook } from './owner-stamp.hook';
import type { EntityHookContext, OwnedEntity } from './entity-hook';

interface Pet extends OwnedEntity {
  readonly id: string;
  readonly name: string;
}

interface BlogPost extends PlainLiteralObject {
  readonly id: string;
  readonly authorId: string;
  readonly title: string;
}

// Stub entity classes for the `.for(entity, column?)` factory. Fields
// declared so the classes structurally satisfy `Type<Pet>` / `Type<BlogPost>`.
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

function fakeCtx(actor?: { id: string; type: 'user' }): EntityHookContext {
  const ctx = {
    entity: 'pet',
    params: {},
    query: {},
    options: {},
    operation: 'create',
    action: 'write',
    with: () => actor,
  };
  return ctx as unknown as EntityHookContext;
}

/**
 * `owner-stamp.hook.ts:30-44` documents a 4-case anti-spoofing matrix
 * for the incoming owner column value. This spec exhaustively covers
 * every row of that table — a regression on any branch is a privilege
 * boundary failure (silent ownership disclosure or misattribution).
 */
describe('OwnerStampHook — 4-case anti-spoofing matrix (beforeCreate)', () => {
  const Hook = OwnerStampHook.for<Pet>(PetEntity);
  const ctx = (): EntityHookContext =>
    fakeCtx({ id: 'authoritative-actor', type: 'user' });

  it('case 1: absent userId field — stamped with actor.id', () => {
    const instance = new Hook();
    const payload = { id: '1', name: 'Rex' } as Pet;
    const result = instance.beforeCreate(payload, ctx());
    expect(result.userId).toBe('authoritative-actor');
  });

  it('case 1b: undefined userId — stamped with actor.id', () => {
    const instance = new Hook();
    const payload = {
      id: '1',
      name: 'Rex',
      userId: undefined,
    } as unknown as Pet;
    const result = instance.beforeCreate(payload, ctx());
    expect(result.userId).toBe('authoritative-actor');
  });

  it('case 1c: empty-string userId — stamped with actor.id', () => {
    const instance = new Hook();
    const payload: Pet = { id: '1', name: 'Rex', userId: '' };
    const result = instance.beforeCreate(payload, ctx());
    expect(result.userId).toBe('authoritative-actor');
  });

  it('case 2: userId === actor.id — passes through unchanged (identity preserved)', () => {
    const instance = new Hook();
    const payload: Pet = {
      id: '1',
      name: 'Rex',
      userId: 'authoritative-actor',
    };
    const result = instance.beforeCreate(payload, ctx());
    // Same shape, same column value (the stamp is a no-op write of the
    // same value, which is fine semantically).
    expect(result.userId).toBe('authoritative-actor');
    // The hook returns the same payload object (mutated in place by
    // design — see owner-stamp.hook.ts:78-82).
    expect(result).toBe(payload);
  });

  it('case 3: client-supplied other userId — overwritten with actor.id (anti-spoofing)', () => {
    const instance = new Hook();
    const payload: Pet = {
      id: '1',
      name: 'Rex',
      userId: 'spoofed-victim-uuid',
    };
    const result = instance.beforeCreate(payload, ctx());
    expect(result.userId).toBe('authoritative-actor');
    expect(result.userId).not.toBe('spoofed-victim-uuid');
  });

  it('case 4: no actor in context — throws Unauthorized', () => {
    const instance = new Hook();
    const payload: Pet = { id: '1', name: 'Rex', userId: '' };
    // `fakeCtx()` with no arg returns a ctx whose overlay yields undefined.
    expect(() => instance.beforeCreate(payload, fakeCtx())).toThrow();
  });

  it('case 4b: missing context entirely — throws Unauthorized', () => {
    const instance = new Hook();
    const payload: Pet = { id: '1', name: 'Rex', userId: '' };
    expect(() => instance.beforeCreate(payload)).toThrow();
  });
});

describe('OwnerStampHook — 4-case anti-spoofing matrix (beforeUpdate)', () => {
  const Hook = OwnerStampHook.for<Pet>(PetEntity);
  const ctx = (): EntityHookContext =>
    fakeCtx({ id: 'authoritative-actor', type: 'user' });

  it('case 1: absent userId field — stamped on update', () => {
    const instance = new Hook();
    const payload = { id: '1', name: 'NewName' } as Pet;
    const result = instance.beforeUpdate(payload, ctx());
    expect(result.userId).toBe('authoritative-actor');
  });

  it('case 3: spoofed userId on update — overwritten', () => {
    const instance = new Hook();
    const payload: Pet = { id: '1', name: 'NewName', userId: 'spoofed' };
    const result = instance.beforeUpdate(payload, ctx());
    expect(result.userId).toBe('authoritative-actor');
  });

  it('case 4: no actor on update — throws Unauthorized', () => {
    const instance = new Hook();
    const payload: Pet = { id: '1', name: 'X', userId: '' };
    expect(() => instance.beforeUpdate(payload, fakeCtx())).toThrow();
  });
});

describe('OwnerStampHook — custom column via .for(entity, column)', () => {
  it('stamps the custom column instead of userId', () => {
    const Hook = OwnerStampHook.for<BlogPost, 'authorId'>(
      BlogPostEntity,
      'authorId',
    );
    const instance = new Hook();
    const ctx = fakeCtx({ id: 'actor-3', type: 'user' });
    const payload: BlogPost = {
      id: '1',
      authorId: 'spoofed',
      title: 'Post',
    };
    const result = instance.beforeCreate(payload, ctx);
    expect(result.authorId).toBe('actor-3');
    // Verifies the custom column is the ONLY column touched.
    expect((result as PlainLiteralObject).userId).toBeUndefined();
  });

  it('throws Unauthorized for the custom column when actor missing', () => {
    const Hook = OwnerStampHook.for<BlogPost, 'authorId'>(
      BlogPostEntity,
      'authorId',
    );
    const instance = new Hook();
    const payload: BlogPost = { id: '1', authorId: '', title: 'X' };
    expect(() => instance.beforeCreate(payload)).toThrow(/authorId/);
  });
});
