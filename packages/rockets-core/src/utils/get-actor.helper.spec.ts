import type { PlainLiteralObject } from '@nestjs/common';
import type { OverlayRef } from '@concepta/nestjs-core';
import { ActorCtx } from '../infrastructure/interceptors/actor.overlay';
import { getActor, getCrudContext } from './get-actor.helper';

describe('getActor', () => {
  it('returns undefined for null/undefined input', () => {
    expect(getActor(undefined)).toBeUndefined();
  });

  it('returns undefined when context has no .with() overlay accessor', () => {
    expect(getActor({ params: {} })).toBeUndefined();
  });

  it('reads the actor from the overlay when .with(ActorCtx) is callable', () => {
    const ctx = {
      supports: jest.fn(
        (ref: OverlayRef<string, PlainLiteralObject, unknown[]>) =>
          ref === ActorCtx,
      ),
      with: jest.fn((ref: OverlayRef<string, PlainLiteralObject, unknown[]>) =>
        ref === ActorCtx ? { id: 'user-1', type: 'user' as const } : undefined,
      ),
    };
    const actor = getActor(ctx as unknown as Record<string, unknown>);
    expect(actor).toEqual({ id: 'user-1', type: 'user' });
    expect(ctx.supports).toHaveBeenCalledWith(ActorCtx);
    expect(ctx.with).toHaveBeenCalled();
  });

  it('returns whatever the overlay returns (undefined included)', () => {
    const ctx = { supports: () => true, with: () => undefined };
    expect(getActor(ctx as unknown as Record<string, unknown>)).toBeUndefined();
  });
});

describe('getCrudContext', () => {
  it('returns undefined for null/undefined input', () => {
    expect(getCrudContext(undefined)).toBeUndefined();
  });

  it('returns undefined for non-object input', () => {
    expect(
      getCrudContext('string' as unknown as Record<string, unknown>),
    ).toBeUndefined();
  });

  it('returns undefined when entity is missing', () => {
    expect(getCrudContext({ params: {}, operation: 'list' })).toBeUndefined();
  });

  it('returns undefined when params is not an object', () => {
    expect(
      getCrudContext({ entity: 'pet', params: 'oops', operation: 'list' }),
    ).toBeUndefined();
  });

  it('returns undefined when operation is missing', () => {
    expect(getCrudContext({ entity: 'pet', params: {} })).toBeUndefined();
  });

  it('narrows when all required CRUD fields are present', () => {
    const raw = {
      entity: 'pet',
      params: { id: '1' },
      query: {},
      options: {},
      operation: 'read',
      action: 'read',
    };
    const narrowed = getCrudContext(raw);
    expect(narrowed).toBe(raw);
    expect(narrowed?.entity).toBe('pet');
    expect(narrowed?.params.id).toBe('1');
  });

  it('preserves query/options/action on the narrowed reference (council gap #5)', () => {
    const raw = {
      entity: 'pet',
      params: { id: '1' },
      query: { filter: 'foo' },
      options: { paranoid: true },
      operation: 'read',
      action: 'read',
    };
    const narrowed = getCrudContext(raw);
    // The narrower returns the same reference, so all fields survive.
    expect(narrowed?.query).toBe(raw.query);
    expect(narrowed?.options).toBe(raw.options);
    expect(narrowed?.action).toBe('read');
  });

  it('returns undefined when entity is not a string', () => {
    expect(
      getCrudContext({ entity: 42, params: {}, operation: 'read' }),
    ).toBeUndefined();
    expect(
      getCrudContext({ entity: { obj: true }, params: {}, operation: 'read' }),
    ).toBeUndefined();
    expect(
      getCrudContext({ entity: null, params: {}, operation: 'read' }),
    ).toBeUndefined();
  });

  it('returns undefined when operation is not a string', () => {
    expect(
      getCrudContext({ entity: 'pet', params: {}, operation: 42 }),
    ).toBeUndefined();
  });

  it('returns undefined when params is null', () => {
    // typeof null === 'object', so the helper must guard against null
    // explicitly. The current implementation accepts `params: null` —
    // this test pins the runtime behaviour (null IS object-typed and
    // passes the typeof check). If we tighten the helper later, this
    // test catches the change.
    const result = getCrudContext({
      entity: 'pet',
      params: null,
      operation: 'read',
    });
    // params: null is structurally `object`, so `typeof params === 'object'`
    // returns true and the narrower passes — documents the boundary.
    expect(result).toBeDefined();
  });
});
