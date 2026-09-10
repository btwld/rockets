import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  assertFailClosedResponse,
  findOpenResponseObject,
} from './open-api-schema.util';

const open = z.looseObject({ a: z.string() });
const closed = z.object({ a: z.string() });

/**
 * Every node that can hold another schema must be walked: serialization
 * IS validation, so an open object anywhere in a response tree ships the
 * whole row. Each case below places the same open object one level down
 * a different wrapper.
 */
describe('assertFailClosedResponse', () => {
  const rejected: Array<[string, z.ZodType]> = [
    ['plain loose object', open],
    ['catchall', z.object({ a: z.string() }).catchall(z.unknown())],
    ['in array', z.array(open)],
    ['in union', z.union([closed, open])],
    [
      'in discriminated union',
      z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('c'), a: z.string() }),
        z.looseObject({ kind: z.literal('o'), a: z.string() }),
      ]),
    ],
    ['in intersection (right)', z.intersection(closed, open)],
    ['in intersection (left)', z.intersection(open, closed)],
    ['in record value', z.record(z.string(), open)],
    ['in map value', z.map(z.string(), open)],
    ['in set', z.set(open)],
    ['in tuple item', z.tuple([z.string(), open])],
    ['in tuple rest', z.tuple([z.string()], open)],
    ['in readonly', open.readonly()],
    ['in catch', open.catch({ a: 'x' })],
    ['in optional', open.optional()],
    ['in nullable', open.nullable()],
    ['in default', open.default({ a: 'x' })],
    ['in prefault', open.prefault({ a: 'x' })],
    ['in nonoptional', open.optional().nonoptional()],
    ['in preprocess out side', z.preprocess((v) => v, open)],
    // PR #105 review: an ordinary `.transform()` is a pipe whose object
    // sits on the IN side, and an identity transform ships whatever it
    // let through.
    ['in transform in side', open.transform((value) => value)],
    ['in pipe into any', z.pipe(open, z.any())],
    // Composites holding a pass-through below them hand SOME input through.
    [
      'in pipe of arrays into array(any)',
      z.pipe(z.array(open), z.array(z.any())),
    ],
    [
      'in pipe of objects into object with an any property',
      z.pipe(z.object({ a: open }), z.object({ a: z.any() })),
    ],
    [
      'in pipe into intersection of any',
      z.pipe(open, z.intersection(z.any(), z.any())),
    ],
    [
      'in pipe of records into record of any',
      z.pipe(z.record(z.string(), open), z.record(z.string(), z.any())),
    ],
    [
      'in pipe into a nested pipe of any',
      z.pipe(open, z.pipe(z.any(), z.any())),
    ],
    [
      'in pipe into lazy(any)',
      z.pipe(
        open,
        z.lazy(() => z.any()),
      ),
    ],
    ['in pipe into any.optional()', z.pipe(open, z.any().optional())],
    [
      'in pipe into union([any, string])',
      z.pipe(open, z.union([z.any(), z.string()])),
    ],
    [
      'in pipe into unknown',
      // Fixture cast: zod's pipe typing is invariant on the OUT input type;
      // the runtime shape (a pass-through OUT) is what the check reads.
      z.pipe(open, z.unknown() as z.ZodType<unknown, z.output<typeof open>>),
    ],
    [
      'in pipe into custom',
      z.pipe(
        open,
        z.custom<object>(() => true) as z.ZodType<
          object,
          z.output<typeof open>
        >,
      ),
    ],
    ['in lazy', z.lazy(() => open)],
    [
      'in a recursive lazy through a preprocess',
      (() => {
        const node: z.ZodType = z.lazy(() =>
          z.preprocess(
            (value) => value,
            z.looseObject({ id: z.string(), children: z.array(node) }),
          ),
        );
        return z.object({ root: node });
      })(),
    ],
    ['nested object field', z.object({ inner: open })],
    ['deep: array of optional readonly', z.array(open.readonly().optional())],
  ];

  it.each(rejected)('rejects an open object %s', (_label, schema) => {
    expect(() => assertFailClosedResponse(schema, 'spec')).toThrow(
      /is open at/,
    );
  });

  // Undeclared keys AND unconstrained values, applied to the WHOLE
  // response, is `.passthrough()` written a different way: the serializer
  // hands the entire row through, hidden columns included.
  const rejectedRoots: Array<[string, z.ZodType]> = [
    ['record of unknown', z.record(z.string(), z.unknown())],
    ['record of any', z.record(z.string(), z.any())],
    ['record of open object', z.record(z.string(), open)],
    ['bare unknown', z.unknown()],
    ['bare any', z.any()],
    ['bare custom', z.custom(() => true)],
    // Root position survives every wrapper that names no key — each of
    // these ships the value it is handed, verbatim.
    ['optional unknown', z.unknown().optional()],
    ['nullable unknown', z.unknown().nullable()],
    ['readonly unknown', z.unknown().readonly()],
    ['array of unknown', z.array(z.unknown())],
    ['array of record of unknown', z.array(z.record(z.string(), z.unknown()))],
    ['lazy unknown', z.lazy(() => z.unknown())],
    ['union with an unknown branch', z.union([closed, z.unknown()])],
    ['intersection with unknown', z.intersection(closed, z.unknown())],
    ['pipe whose out is unknown', z.pipe(z.unknown(), z.unknown())],
  ];

  it.each(rejectedRoots)('rejects a pass-through root: %s', (_l, schema) => {
    expect(() => assertFailClosedResponse(schema, 'spec')).toThrow(
      /is open at/,
    );
  });

  // Inside a declared property the author named the key and chose what
  // its value may be — the shape of a JSON column. Rejecting it would
  // make a JSON column unserializable.
  it('accepts an array of closed objects, and a tuple position', () => {
    expect(() =>
      assertFailClosedResponse(z.array(closed), 'spec'),
    ).not.toThrow();
    expect(() =>
      assertFailClosedResponse(z.tuple([z.unknown()]), 'spec'),
    ).not.toThrow();
  });

  it('accepts a record of unknown inside a declared property', () => {
    expect(() =>
      assertFailClosedResponse(
        z.object({
          id: z.string(),
          profile: z.record(z.string(), z.unknown()),
        }),
        'spec',
      ),
    ).not.toThrow();
  });

  const accepted: Array<[string, z.ZodType]> = [
    ['closed object', closed],
    ['strict object', closed.strict()],
    ['record of primitives', z.record(z.string(), z.number())],
    ['array of closed', z.array(closed)],
    [
      'intersection of closed',
      z.intersection(closed, z.object({ b: z.number() })),
    ],
    ['tuple of closed', z.tuple([closed], z.string())],
    ['readonly closed', closed.readonly()],
    ['catch closed', closed.catch({ a: 'x' })],
    ['preprocess with closed out', z.preprocess((v) => v, closed)],
    // The closed `out` strips on the way out; nothing from `in` leaks.
    ['pipe from open into closed', z.pipe(open, closed)],
    [
      // The cycle crosses a pipe: the walker must terminate, not overflow.
      'recursive lazy through a preprocess of closed',
      (() => {
        const node: z.ZodType = z.lazy(() =>
          z.preprocess(
            (value) => value,
            z.object({ id: z.string(), children: z.array(node) }),
          ),
        );
        return z.object({ root: node });
      })(),
    ],
    [
      'recursive lazy of closed',
      z.object({
        get children() {
          return z.array(z.lazy(() => closed));
        },
      }),
    ],
  ];

  it.each(accepted)('accepts %s', (_label, schema) => {
    expect(() => assertFailClosedResponse(schema, 'spec')).not.toThrow();
  });

  // PR #105 review: a memo that stored an in-progress `false` as final made
  // the verdict depend on visit order and failed OPEN — the same schema
  // reported nothing when the poisoning branch came first.
  it('reports an open IN side regardless of field order (no cached in-progress false)', () => {
    const build = (order: 'a-first' | 'b-first') => {
      const A: z.ZodType = z.lazy(() => z.union([B, z.any()]));
      const B: z.ZodType = z.object({ a: A });
      // Fixture widening: zod's pipe typing is invariant on the OUT input
      // type; the runtime shapes are what the walker reads.
      const a = z.pipe(z.object({ ok: z.string() }) as z.ZodType, A);
      const b = z.pipe(z.looseObject({ leak: z.string() }) as z.ZodType, B);
      return order === 'a-first' ? z.object({ a, b }) : z.object({ b, a });
    };
    expect(findOpenResponseObject(build('a-first'))).toBe('$.b<in');
    expect(findOpenResponseObject(build('b-first'))).toBe('$.b<in');
  });

  it('still reports an open IN side after an earlier walk over shared instances', () => {
    // The transform sits INSIDE the cycle and is visited after `children`:
    // a walk that starts at `node` reaches `kids` while `node` is still in
    // progress. A memo that stored that in-progress `false` as final then
    // hid the open IN side behind `kids` on the NEXT walk — so the warm-up
    // must come first, on the same instances.
    const kids: z.ZodType = z.lazy(() => z.array(node));
    const node: z.ZodType = z.lazy(() =>
      z.object({
        children: kids,
        label: z.string().transform((s) => s.trim()),
      }),
    );
    findOpenResponseObject(
      z.pipe(z.object({ ok: z.string() }) as z.ZodType, node),
    );
    expect(
      findOpenResponseObject(
        z.pipe(z.looseObject({ leak: z.string() }) as z.ZodType, kids),
      ),
    ).toBe('$<in');
  });

  it('names the path of the open node', () => {
    expect(() =>
      assertFailClosedResponse(
        z.object({ list: z.array(z.object({ deep: open }).readonly()) }),
        'spec',
      ),
    ).toThrow('"$.list[].deep"');
  });
});
