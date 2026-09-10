import { describe, it, expect } from 'vitest';
import type { PlainLiteralObject, Type } from '@nestjs/common';
import { z } from 'zod';
import { rocketsFieldMeta, unwrapField } from './field-meta';
import { f } from './fields';
import { assertNoHiddenFields, projectSchema } from './zod-projections';
import { buildResponseSchema } from './zod-response-schema';

describe('projectSchema response exposure', () => {
  class PetEntity {
    id!: string;
  }
  const entity = PetEntity as Type<PlainLiteralObject>;
  const noOwner = new Set<string>();

  const responseKeys = (schema: z.ZodObject): string[] =>
    Object.keys(projectSchema('Pet', schema, entity, noOwner).response);

  /** Narrows `optional(array(object))` down to the element's keys. */
  const computedElementKeys = (field: z.ZodType | undefined): string[] => {
    const inner = field instanceof z.ZodOptional ? field.unwrap() : field;
    if (!(inner instanceof z.ZodArray)) {
      throw new Error('expected a computed array field');
    }
    const element = inner.element;
    if (!(element instanceof z.ZodObject)) {
      throw new Error('expected an object element');
    }
    return Object.keys(element.shape);
  };

  /**
   * Non-base fields must opt in via `dto.response:true` (or via `f.*`
   * helpers, which register that flag by default). Raw zod without meta
   * stays hidden — forgetting to annotate fails closed.
   */
  it('does not expose ordinary non-base fields without dto.response:true', () => {
    const schema = z.object({
      id: f.pk(),
      name: z.string(),
      dateCreated: f.createdAt(),
    });
    expect(responseKeys(schema)).toEqual(['id', 'dateCreated']);
  });

  it('exposes a non-base field only when dto.response is explicitly true', () => {
    const schema = z.object({
      id: f.pk(),
      name: z.string().register(rocketsFieldMeta, { dto: { response: true } }),
      internalNote: z.string(),
    });
    expect(responseKeys(schema)).toEqual(['id', 'name']);
  });

  /**
   * Secrets are kept out by NOT opting them in — the default already
   * fails closed. There is no name-based heuristic, on purpose: it would
   * eat harmless fields (`hashtags`, `tokenExpiresAt`) while missing the
   * ones that matter (`apiKey`, `salt`, `cardNumber`).
   */
  it('hides unannotated credential columns, whatever they are named', () => {
    const schema = z.object({
      id: f.pk(),
      passwordHash: z.string(),
      apiKey: z.string(),
      salt: z.string(),
    });
    expect(responseKeys(schema)).toEqual(['id']);
  });

  it('does not second-guess the author on harmless credential-ish names', () => {
    const schema = z.object({
      id: f.pk(),
      tokenExpiresAt: f.string(),
      mfaEnabled: f.bool(),
      hashtags: f.string(),
    });
    expect(responseKeys(schema)).toEqual([
      'id',
      'tokenExpiresAt',
      'mfaEnabled',
      'hashtags',
    ]);
  });

  it('keeps an f.* field out once it opts out, credential-shaped or not', () => {
    const schema = z.object({
      id: f.pk(),
      passwordHash: f.string({ dto: { response: false } }),
      apiKey: f.string({ dto: { response: false } }),
    });
    expect(responseKeys(schema)).toEqual(['id']);
  });

  it('honours an explicit dto.response=false on a base-entity field', () => {
    const schema = z.object({
      id: f.pk(),
      dateCreated: f
        .createdAt()
        .register(rocketsFieldMeta, { dto: { response: false } }),
    });
    expect(responseKeys(schema)).toEqual(['id']);
  });

  /**
   * The owner column ships on the wire by default (stable key for the UI
   * to group by author / answer "is this mine?"), but a resource whose
   * rows are visible to non-owners can hide it.
   */
  it('f.owner() is exposed by default and stays out of create/update', () => {
    const schema = z.object({ id: f.pk(), userId: f.owner() });
    const owners = new Set(['userId']);
    const { response, create, update } = projectSchema(
      'Pet',
      schema,
      entity,
      owners,
    );

    expect(Object.keys(response)).toContain('userId');
    expect(Object.keys(create)).not.toContain('userId');
    expect(Object.keys(update)).not.toContain('userId');
  });

  it('f.owner({ dto: { response: false } }) keeps the owner id off the wire', () => {
    const schema = z.object({
      id: f.pk(),
      userId: f.owner({ dto: { response: false } }),
    });
    const { response } = projectSchema(
      'Pet',
      schema,
      entity,
      new Set(['userId']),
    );

    expect(Object.keys(response)).toEqual(['id']);
  });

  it('f.* scalars opt into the response DTO by default', () => {
    const schema = z.object({
      id: f.pk(),
      title: f.string(),
      age: f.int(),
    });
    expect(responseKeys(schema)).toEqual(['id', 'title', 'age']);
  });

  /**
   * A compute schema is an explicit wire declaration, so it is not
   * subject to the opt-in rule — but an explicit `response: false` still
   * has to hold, because compute schemas are routinely built from an
   * entity schema that carries hidden columns.
   */
  it('strips dto.response=false out of a computed field schema', () => {
    const nested = z.object({
      id: f.pk(),
      label: f.string(),
      internalNote: f.string({ dto: { response: false } }),
    });
    const schema = z.object({
      id: f.pk(),
      items: f.compute(z.array(nested), () => []).optional(),
    });

    const { response } = projectSchema('Pet', schema, entity, noOwner);
    expect(computedElementKeys(response.items)).toEqual(['id', 'label']);
  });

  /**
   * RUNTIME layer (the schema strip above is documentation): the rebuilt
   * field must keep its rocketsFieldMeta registration — losing it means
   * the response schema never sees the compute callback and the field
   * silently vanishes from every HTTP response while OpenAPI still
   * documents it (found in PR review).
   */
  it('keeps the compute meta on the stripped rebuilt field', () => {
    const nested = z.object({
      id: f.pk(),
      internalNote: f.string({ dto: { response: false } }),
    });
    const schema = z.object({
      id: f.pk(),
      items: f.compute(z.array(nested), () => []).optional(),
    });

    const { response } = projectSchema('Pet', schema, entity, noOwner);
    const { meta } = unwrapField(response.items as z.ZodType, 'Pet.items');
    expect(typeof meta.compute).toBe('function');
  });

  /**
   * RUNTIME layer: `projectSchema` only decides the SHAPE; the strip of a
   * compute output happens when the response schema built by
   * `buildResponseSchema` validates the row (`~standard.validate`), which
   * is exactly what upstream runs at serialization time.
   */
  it('strips hidden and undeclared keys from the compute OUTPUT at runtime', async () => {
    const nested = z.object({
      id: f.pk(),
      label: f.string(),
      internalNote: f.string({ dto: { response: false } }),
    });
    const row = {
      id: '00000000-0000-4000-8000-000000000001',
      label: 'ok',
      internalNote: 'must-not-leak',
      undeclaredColumn: 'must-not-leak-either',
    };
    const schema = z.object({
      id: f.pk(),
      items: f.compute(z.array(nested), () => [row]).optional(),
    });

    const responseSchema = buildResponseSchema(
      'Pet',
      projectSchema('Pet', schema, entity, noOwner),
    );
    const result = await responseSchema['~standard'].validate({
      id: '00000000-0000-4000-8000-000000000002',
      hiddenRowColumn: 'must-not-leak',
    });

    expect(result.issues).toBeUndefined();
    if (result.issues) return;
    expect(result.value).toEqual({
      id: '00000000-0000-4000-8000-000000000002',
      items: [{ id: row.id, label: 'ok' }],
    });
  });

  /**
   * The strip must reach a hidden column N levels down — an object inside
   * an optional object inside an array — not only the first level.
   */
  it('strips a hidden column nested deep inside a compute OUTPUT', async () => {
    const owner = z.object({
      id: f.pk(),
      email: f.string(),
      passwordHash: f.string({ dto: { response: false } }),
    });
    const item = z.object({
      id: f.pk(),
      owner: owner.optional(),
      tags: z.array(
        z.object({
          label: f.string(),
          secret: f.string({ dto: { response: false } }),
        }),
      ),
    });
    const row = {
      id: '00000000-0000-4000-8000-000000000001',
      owner: {
        id: '00000000-0000-4000-8000-000000000009',
        email: 'a@b.c',
        passwordHash: 'leak',
      },
      tags: [{ label: 't', secret: 'leak' }],
    };
    const schema = z.object({
      id: f.pk(),
      items: f.compute(z.array(item), () => [row]).optional(),
    });

    const responseSchema = buildResponseSchema(
      'Pet',
      projectSchema('Pet', schema, entity, noOwner),
    );
    const result = await responseSchema['~standard'].validate({
      id: '00000000-0000-4000-8000-000000000002',
    });

    expect(result.issues).toBeUndefined();
    if (result.issues) return;
    expect(result.value).toEqual({
      id: '00000000-0000-4000-8000-000000000002',
      items: [
        {
          id: row.id,
          owner: { id: row.owner.id, email: 'a@b.c' },
          tags: [{ label: 't' }],
        },
      ],
    });
  });

  // PR #105 review: a union declares the hidden key on one of its options,
  // so zod's own stripping cannot remove it — the projection must rebuild
  // the union with the hidden field removed from every option.
  it('strips a hidden column reached through a union / intersection / pipe at runtime', async () => {
    const nested = z.object({
      id: f.pk(),
      secret: f.string({ dto: { response: false } }),
    });
    const fallback = z.object({ label: f.string() });
    const row = {
      id: '00000000-0000-4000-8000-000000000001',
      secret: 'must-not-leak',
    };
    const schema = z.object({
      id: f.pk(),
      union: f.compute(z.union([nested, fallback]), () => row),
      both: f.compute(
        z.intersection(nested, z.object({ extra: f.string() })),
        () => ({
          ...row,
          extra: 'e',
        }),
      ),
      piped: f.compute(
        nested.transform((value) => value),
        () => row,
      ),
    });

    const responseSchema = buildResponseSchema(
      'Pet',
      projectSchema('Pet', schema, entity, noOwner),
    );
    const result = await responseSchema['~standard'].validate({
      id: '00000000-0000-4000-8000-000000000002',
    });

    expect(result.issues).toBeUndefined();
    if (result.issues) return;
    expect(result.value).toEqual({
      id: '00000000-0000-4000-8000-000000000002',
      union: { id: row.id },
      both: { id: row.id, extra: 'e' },
      piped: { id: row.id },
    });
  });

  // The marker is registered on the node `f.string()` returns. Anything
  // the author writes AFTER that — `.readonly()`, `.nonoptional()`,
  // `.prefault()`, `.catch()`, `z.array(...)`, `.transform()` — leaves it
  // one level down, where a check that only reads direct properties
  // cannot see it and the recursive walk cannot recover it (the marked
  // node is a bare leaf with no children). All six were accepted, and
  // the projection kept the column.
  describe.each([
    ['readonly', () => f.string({ dto: { response: false } }).readonly()],
    ['nonoptional', () => f.string({ dto: { response: false } }).nonoptional()],
    ['prefault', () => f.string({ dto: { response: false } }).prefault('x')],
    ['catch', () => f.string({ dto: { response: false } }).catch('x')],
    ['array', () => z.array(f.string({ dto: { response: false } }))],
  ])('a hidden field wrapped in %s', (_label, make: () => z.ZodType) => {
    it('is rejected in a hand-written response schema', () => {
      expect(() =>
        assertNoHiddenFields(z.object({ pw: make() }), 'spec'),
      ).toThrow(/dto: \{ response: false \}/);
    });

    it('is dropped from a computed projection', () => {
      const schema = z.object({
        id: f.pk(),
        nested: f.compute(
          z.object({ id: z.uuid(), pw: make() }),
          () => ({} as never),
        ),
      });
      const projected = projectSchema('Pet', schema, entity, noOwner).response;
      const nested = projected['nested'];
      const inner = nested instanceof z.ZodOptional ? nested.unwrap() : nested;
      expect(inner).toBeInstanceOf(z.ZodObject);
      expect(Object.keys((inner as z.ZodObject).shape)).toEqual(['id']);
    });
  });

  // The sixth wrapper of the same family. A transform's output cannot be
  // rebuilt without the hidden input, so the projection refuses instead
  // of dropping — the same answer this file already gives for `.default()`
  // and `.catch()`. Before, it was accepted and the column was kept.
  it('a hidden field under a .transform() is rejected, both ways', () => {
    const make = (): z.ZodType =>
      f.string({ dto: { response: false } }).transform((v) => v);

    expect(() =>
      assertNoHiddenFields(z.object({ pw: make() }), 'spec'),
    ).toThrow(/dto: \{ response: false \}/);
    expect(() =>
      projectSchema(
        'Pet',
        z.object({
          id: f.pk(),
          nested: f.compute(
            z.object({ id: z.uuid(), pw: make() }),
            () => ({} as never),
          ),
        }),
        entity,
        noOwner,
      ),
    ).toThrow(/cannot rebuild/);
  });

  // A lazy defers everything, including the throw — the rebuilt getter
  // used to run first at SERIALIZATION, turning a definition error into a
  // 500 on the first response the route served.
  it('rejects a hidden leaf under a z.lazy() at definition time', () => {
    const hidden = f.string({ dto: { response: false } });
    const lazy = z.lazy(() => hidden);

    expect(() =>
      projectSchema(
        'Pet',
        z.object({
          id: f.pk(),
          nested: f.compute(
            z.object({ id: z.uuid(), pw: lazy }),
            () => ({} as never),
          ),
        }),
        entity,
        noOwner,
      ),
    ).toThrow(/dto: \{ response: false \}/);
  });

  it('rejects at definition time a hidden column below a wrapper it cannot rebuild', () => {
    const nested = z.object({
      id: f.pk(),
      secret: f.string({ dto: { response: false } }),
    });
    const inTuple = z.object({
      id: f.pk(),
      pair: f.compute(z.tuple([nested, nested]), () => [] as never),
    });
    expect(() => projectSchema('Pet', inTuple, entity, noOwner)).toThrow(
      /cannot rebuild/,
    );

    const inRecord = z.object({
      id: f.pk(),
      byKey: f.compute(z.record(z.string(), nested), () => ({})),
    });
    expect(() => projectSchema('Pet', inRecord, entity, noOwner)).toThrow(
      /cannot rebuild/,
    );
  });

  // `.default(value)` / `.catch(value)` hand their payload over WITHOUT
  // running the inner schema, so a stripped inner schema would not strip
  // the payload — the only safe answer is to refuse at definition time.
  it('rejects at definition time a hidden column below .default() / .catch()', () => {
    const nested = z.object({
      id: f.pk(),
      secret: f.string({ dto: { response: false } }),
    });
    const payload = {
      id: '00000000-0000-4000-8000-000000000001',
      secret: 'leak',
    };
    for (const wrapped of [nested.default(payload), nested.catch(payload)]) {
      const schema = z.object({
        id: f.pk(),
        probe: f.compute(z.object({ inner: wrapped }), () => ({
          inner: payload,
        })),
      });
      expect(() => projectSchema('Pet', schema, entity, noOwner)).toThrow(
        /cannot rebuild/,
      );
    }
  });

  // `unwrapField` peels a top-level `.default()` off the field; silently
  // dropping it would turn a definition-time error into a runtime 500
  // (the row without the key fails the rebuilt schema).
  it('rejects at definition time a TOP-LEVEL .default() on a field with a hidden column', () => {
    const blob = z.object({
      id: f.pk(),
      secret: f.string({ dto: { response: false } }),
    });
    const schema = z.object({
      id: f.pk(),
      payload: blob
        .default({ id: '00000000-0000-4000-8000-000000000001', secret: 'x' })
        .register(rocketsFieldMeta, { dto: { response: true } }),
    });
    expect(() => projectSchema('Pet', schema, entity, noOwner)).toThrow(
      /cannot rebuild/,
    );
  });

  // A top-level `z.preprocess` is a pipe around the field; the projection
  // rebuilds it (both sides) instead of peeling it off — the same silent
  // drop the top-level default used to suffer.
  it('keeps a top-level z.preprocess around a field with a hidden column and strips at runtime', async () => {
    const blob = z.object({
      id: f.pk(),
      secret: f.string({ dto: { response: false } }),
    });
    const pk = '00000000-0000-4000-8000-000000000001';
    const schema = z.object({
      id: f.pk(),
      payload: z
        .preprocess(
          (value) => (typeof value === 'string' ? JSON.parse(value) : value),
          blob,
        )
        .register(rocketsFieldMeta, { dto: { response: true } }),
    });
    const responseSchema = buildResponseSchema(
      'Pet',
      projectSchema('Pet', schema, entity, noOwner),
    );
    const result = await responseSchema['~standard'].validate({
      id: pk,
      payload: JSON.stringify({ id: pk, secret: 'leak' }),
    });
    expect(result.issues).toBeUndefined();
    if (result.issues) return;
    expect(result.value).toEqual({ id: pk, payload: { id: pk } });
  });

  // Unlike `.default()`, a `.prefault()` payload runs through the inner
  // schema, so the rebuilt inner strips it — rebuildable.
  it('strips a hidden column through .prefault() at runtime', async () => {
    const nested = z.object({
      id: f.pk(),
      secret: f.string({ dto: { response: false } }),
    });
    const pk = '00000000-0000-4000-8000-000000000001';
    const schema = z.object({
      id: f.pk(),
      probe: f.compute(
        z.object({ inner: nested.prefault({ id: pk, secret: 'leak' }) }),
        // Fixture cast: the key is deliberately ABSENT so the prefault payload
        // is what reaches the (rebuilt) inner schema.
        () => ({} as { inner: { id: string; secret: string } }),
      ),
    });
    const responseSchema = buildResponseSchema(
      'Pet',
      projectSchema('Pet', schema, entity, noOwner),
    );
    const result = await responseSchema['~standard'].validate({ id: pk });
    expect(result.issues).toBeUndefined();
    if (result.issues) return;
    expect(result.value).toEqual({ id: pk, probe: { inner: { id: pk } } });
  });

  it('strips a hidden column inside a RECURSIVE lazy schema without looping', async () => {
    interface Node {
      id: string;
      secret: string;
      children: Node[];
    }
    const node: z.ZodType<Node> = z.object({
      id: f.pk(),
      secret: f.string({ dto: { response: false } }),
      children: z.array(z.lazy(() => node)),
    });
    const row = {
      id: '00000000-0000-4000-8000-000000000001',
      secret: 'leak',
      children: [
        {
          id: '00000000-0000-4000-8000-000000000002',
          secret: 'leak2',
          children: [],
        },
      ],
    };
    const schema = z.object({
      id: f.pk(),
      tree: f.compute(node, () => row),
    });

    const responseSchema = buildResponseSchema(
      'Pet',
      projectSchema('Pet', schema, entity, noOwner),
    );
    const result = await responseSchema['~standard'].validate({
      id: '00000000-0000-4000-8000-000000000003',
    });
    expect(result.issues).toBeUndefined();
    if (result.issues) return;
    expect(result.value).toEqual({
      id: '00000000-0000-4000-8000-000000000003',
      tree: {
        id: row.id,
        children: [{ id: row.children[0].id, children: [] }],
      },
    });
  });

  // The cycle crosses a pipe (`z.preprocess`): every walker — hidden
  // detection, strip, fail-closed — must terminate, not overflow.
  it('strips a hidden column inside a recursive lazy that crosses a preprocess', async () => {
    interface Node {
      id: string;
      secret: string;
      children: Node[];
    }
    const node: z.ZodType<Node> = z.lazy(() =>
      z.preprocess(
        (value) => value,
        z.object({
          id: f.pk(),
          secret: f.string({ dto: { response: false } }),
          children: z.array(node),
        }),
      ),
    );
    const pk = '00000000-0000-4000-8000-000000000001';
    const schema = z.object({
      id: f.pk(),
      tree: f.compute(node, () => ({
        id: pk,
        secret: 'leak',
        children: [{ id: pk, secret: 'leak', children: [] }],
      })),
    });
    const responseSchema = buildResponseSchema(
      'Pet',
      projectSchema('Pet', schema, entity, noOwner),
    );
    const result = await responseSchema['~standard'].validate({ id: pk });
    expect(result.issues).toBeUndefined();
    if (result.issues) return;
    expect(result.value).toEqual({
      id: pk,
      tree: { id: pk, children: [{ id: pk, children: [] }] },
    });
  });

  // `dto: { response: false }` holds on EVERY response path, not only under
  // `f.compute()`: a JSON column whose schema nests a hidden field, and an
  // exposed relation whose field nests one, strip it too.
  it('strips a hidden column nested in a plain JSON column and in an exposed relation', async () => {
    const blob = z.object({
      id: f.pk(),
      secret: f.string({ dto: { response: false } }),
    });
    const child = z.object({
      id: f.pk(),
      blob: blob.register(rocketsFieldMeta, { dto: { response: true } }),
      secret: f.string({ dto: { response: false } }),
    });
    const schema = z.object({
      id: f.pk(),
      payload: blob.register(rocketsFieldMeta, { dto: { response: true } }),
      kids: f.hasMany(child, { expose: true, include: 'default' }),
    });
    const pk = '00000000-0000-4000-8000-000000000001';

    const responseSchema = buildResponseSchema(
      'Pet',
      projectSchema('Pet', schema, entity, noOwner),
    );
    const result = await responseSchema['~standard'].validate({
      id: pk,
      payload: { id: pk, secret: 'leak' },
      kids: [{ id: pk, blob: { id: pk, secret: 'leak' }, secret: 'leak' }],
    });
    expect(result.issues).toBeUndefined();
    if (result.issues) return;
    expect(result.value).toEqual({
      id: pk,
      payload: { id: pk },
      kids: [{ id: pk, blob: { id: pk } }],
    });
  });

  it('a compute value that violates its declared schema is a validation issue, not a coerced payload', async () => {
    const schema = z.object({
      id: f.pk(),
      // `Number('abc')` is NaN — a number at the type level that z.int()
      // rejects at runtime.
      count: f.compute(f.int(), (row) => Number(row.rawCount)),
    });

    const responseSchema = buildResponseSchema(
      'Pet',
      projectSchema('Pet', schema, entity, noOwner),
    );
    const result = await responseSchema['~standard'].validate({
      id: '00000000-0000-4000-8000-000000000002',
      rawCount: 'abc',
    });

    expect(result.issues?.length).toBeGreaterThan(0);
    expect(result.issues?.[0]?.path).toEqual(['count']);
  });

  it('leaves a computed field untouched when nothing is hidden', () => {
    const nested = z.object({ id: f.pk(), label: f.string() });
    const computed = f.compute(z.array(nested), () => []);
    const schema = z.object({ id: f.pk(), items: computed });

    const { response } = projectSchema('Pet', schema, entity, noOwner);
    expect(response.items).toBe(computed);
  });

  /**
   * An optional field without a default compiles to a NULLABLE column and
   * reads back as `null`; the response must admit what the store returns
   * or every such row is a 500 at serialization.
   */
  it('admits null on an optional response field (nullable column read-back)', async () => {
    const schema = z.object({
      id: f.pk(),
      nick: f.string({ max: 20 }).optional(),
      score: f.int().default(0).optional(),
    });
    const response = buildResponseSchema(
      'Pet',
      projectSchema('Pet', schema, entity, noOwner),
    );
    const row = { id: '2d1c2b6e-0f0a-4f5c-9a1b-3c4d5e6f7a8b', nick: null };
    const result = await response['~standard'].validate(row);
    if (result.issues !== undefined) {
      throw new Error(JSON.stringify(result.issues));
    }
    expect(result.value).toMatchObject({ nick: null });
    const withDefault = await response['~standard'].validate({
      ...row,
      score: 3,
    });
    expect(withDefault.issues).toBeUndefined();
  });

  it('f.* can still opt out with dto.response=false', () => {
    const schema = z.object({
      id: f.pk(),
      title: f.string(),
      internalNote: f.string({ dto: { response: false } }),
    });
    expect(responseKeys(schema)).toEqual(['id', 'title']);
  });
});
