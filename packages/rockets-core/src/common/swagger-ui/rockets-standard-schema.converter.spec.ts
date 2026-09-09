import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { withOpenApi } from '@concepta/nestjs-core';
import { createRocketsStandardSchemaConverter } from './rockets-standard-schema.converter';
import { buildPaginatedSchema } from '../utils/open-api-schema.util';

describe('createRocketsStandardSchemaConverter', () => {
  it('turns a named schema into a $ref and lifts nested definitions', () => {
    const convert = createRocketsStandardSchemaConverter();
    const nested = withOpenApi(z.object({ b: z.number() }), 'NestedDto');
    const outer = withOpenApi(z.object({ a: nested }), 'OuterDto');

    const result = convert(outer, { schemaType: 'output' });

    expect(result?.schema).toEqual({
      $ref: '#/components/schemas/OuterDto',
    });
    expect(result?.components).toHaveProperty('OuterDto');
    expect(result?.components).toHaveProperty('NestedDto');
  });

  it('passes an unnamed schema through', () => {
    const convert = createRocketsStandardSchemaConverter();
    expect(
      convert(withOpenApi(z.object({ a: z.string() })), {
        schemaType: 'input',
      }),
    ).toBeUndefined();
    expect(
      convert({ not: 'a schema' }, { schemaType: 'input' }),
    ).toBeUndefined();
  });

  it('rejects two different instances claiming one id', () => {
    const convert = createRocketsStandardSchemaConverter();
    convert(withOpenApi(z.object({ a: z.string() }), 'SameDto'), {
      schemaType: 'output',
    });
    expect(() =>
      convert(withOpenApi(z.object({ b: z.string() }), 'SameDto'), {
        schemaType: 'output',
      }),
    ).toThrow(/two different schema instances/);
  });

  // Nested named schemas never reach the converter themselves — they
  // arrive as definitions of the schema embedding them, once per side.
  it('rejects a nested named schema reached from both sides with different shapes', () => {
    const convert = createRocketsStandardSchemaConverter();
    const address = withOpenApi(
      z.object({ street: z.string(), zip: z.string().default('00000') }),
      'AddressDto',
    );
    const requestSchema = withOpenApi(z.object({ address }), 'CreateOrderDto');
    const responseSchema = withOpenApi(
      z.object({ id: z.uuid(), address }),
      'OrderResponseDto',
    );

    convert(requestSchema, { schemaType: 'input' });
    expect(() => convert(responseSchema, { schemaType: 'output' })).toThrow(
      /"AddressDto" is emitted with two different shapes/,
    );
  });

  it('accepts a nested named schema reached twice from the same side', () => {
    const convert = createRocketsStandardSchemaConverter();
    const address = withOpenApi(z.object({ street: z.string() }), 'AddrDto');
    const a = withOpenApi(z.object({ address }), 'ADto');
    const b = withOpenApi(z.object({ home: address }), 'BDto');

    convert(a, { schemaType: 'output' });
    expect(() => convert(b, { schemaType: 'output' })).not.toThrow();
  });

  it('accepts one instance asked for the same side twice', () => {
    const convert = createRocketsStandardSchemaConverter();
    const plain = withOpenApi(z.object({ n: z.string() }), 'PlainDto');
    convert(plain, { schemaType: 'output' });
    expect(() => convert(plain, { schemaType: 'output' })).not.toThrow();
  });

  // zod's input and output JSON Schemas differ by construction (the
  // output side is `additionalProperties: false`, defaults become
  // required, transforms change types), so one component cannot describe
  // a request and a response; last-wins would document one side with the
  // other's shape silently.
  it('rejects one instance documented as both a request and a response', () => {
    const convert = createRocketsStandardSchemaConverter();
    const dual = withOpenApi(
      z.object({ n: z.string().transform((s) => s.length) }),
      'DualDto',
    );
    convert(dual, { schemaType: 'input' });
    expect(() => convert(dual, { schemaType: 'output' })).toThrow(
      /both a request \(input\) and a response \(output\)/,
    );

    const plain = withOpenApi(z.object({ n: z.string() }), 'PlainDto');
    convert(plain, { schemaType: 'output' });
    expect(() => convert(plain, { schemaType: 'input' })).toThrow(
      /both a request \(input\) and a response \(output\)/,
    );
  });
  it("qualifies zod's positional anonymous definitions per component", () => {
    const convert = createRocketsStandardSchemaConverter();

    interface TreeNode {
      name: string;
      children: TreeNode[];
    }
    const node: z.ZodType<TreeNode> = z.lazy(() =>
      z.object({ name: z.string(), children: z.array(node) }),
    );
    interface CatNode {
      label: number;
      subs: CatNode[];
    }
    const cat: z.ZodType<CatNode> = z.lazy(() =>
      z.object({ label: z.number(), subs: z.array(cat) }),
    );

    // zod names the extracted inner object of each `z.lazy()` `__schema0`,
    // restarting the counter per conversion. Unqualified, the second one
    // collides with the first and aborts the whole document.
    const tree = convert(withOpenApi(z.object({ root: node }), 'TreeDto'), {
      schemaType: 'output',
    });
    const feline = convert(withOpenApi(z.object({ root: cat }), 'CatDto'), {
      schemaType: 'output',
    });

    const names = [
      ...Object.keys(tree?.components ?? {}),
      ...Object.keys(feline?.components ?? {}),
    ];
    expect(names.some((n) => n.startsWith('__schema'))).toBe(false);
    expect(new Set(names).size).toBe(names.length);
    // Content-derived: `RocketsRef_<8 hex of the definition JSON>`. A
    // counter name was guessable; the owner's id made the name depend on
    // which route was converted first.
    expect(
      names.filter((n) => /^RocketsRef_[0-9a-f]{8}$/.test(n)),
    ).toHaveLength(2);

    // The rewrite has to reach the refs INSIDE the lifted definitions too,
    // or the document ships a $ref to a component that no longer exists.
    const refs = JSON.stringify([tree?.components, feline?.components]).match(
      /#\/(?:\$defs|definitions|components\/schemas)\/[A-Za-z0-9_]+/g,
    );
    for (const ref of refs ?? []) {
      const target = ref.slice(ref.lastIndexOf('/') + 1);
      expect(target.startsWith('__schema')).toBe(false);
      expect(names).toContain(target);
    }
  });
  it('documents a named discriminated union with a tag mapping', () => {
    const convert = createRocketsStandardSchemaConverter();
    const circle = withOpenApi(
      z.object({ kind: z.literal('circle'), r: z.number() }),
      'CircleDto',
    );
    const rect = withOpenApi(
      z.object({ kind: z.literal('rect'), w: z.number() }),
      'RectDto',
    );
    // The union is reached under a DIFFERENT id than the one it is emitted
    // under — the shape an operation's generated wrapper produces.
    const shape = withOpenApi(
      z.discriminatedUnion('kind', [circle, rect]),
      'ShapeDto',
    );
    const wrapper = withOpenApi(shape, 'Op_Get_ShapeOutput');

    const result = convert(wrapper, { schemaType: 'output' });
    const shapeJson = result?.components?.['ShapeDto'] as
      | { discriminator?: unknown }
      | undefined;

    // `mapping` is required: the implicit form matches the tag against the
    // COMPONENT name, and 'circle' is not 'CircleDto'.
    expect(shapeJson?.discriminator).toEqual({
      mapping: {
        circle: '#/components/schemas/CircleDto',
        rect: '#/components/schemas/RectDto',
      },
      propertyName: 'kind',
    });
  });

  it('leaves a union with an unnamed branch undiscriminated', () => {
    const convert = createRocketsStandardSchemaConverter();
    const named = withOpenApi(
      z.object({ kind: z.literal('a'), x: z.number() }),
      'NamedBranchDto',
    );
    const union = withOpenApi(
      z.discriminatedUnion('kind', [
        named,
        z.object({ kind: z.literal('b'), y: z.number() }),
      ]),
      'PartlyNamedDto',
    );

    const result = convert(union, { schemaType: 'output' });
    // OpenAPI only allows a discriminator over $ref branches, and a partial
    // mapping would document one tag while silently dropping the other.
    expect(
      (result?.components?.['PartlyNamedDto'] as { discriminator?: unknown })
        ?.discriminator,
    ).toBeUndefined();
  });
  // The cross-conversion halves of the same guarantee: the author's
  // schema and the recursive one arrive on DIFFERENT routes, in either
  // order. Before the content-derived names, author-first silently
  // renamed the generated definition, and generated-first aborted the
  // document blaming a request/response split that does not exist.
  // A lifted definition can reference ANOTHER lifted definition — a
  // recursive node whose field is a second recursive node — and the
  // `__schemaN` names it does that through are positional. Hashing a
  // definition's own JSON alone gave two such definitions the same
  // digest whenever their outer shape matched, and the second document
  // component to claim the name aborted the build. The digest is
  // transitive, so the child's content is part of the parent's name.
  it('two definitions with one shape and different children get different names', () => {
    const convert = createRocketsStandardSchemaConverter();

    interface Inner {
      v: unknown;
      self: Inner[];
    }
    interface Outer {
      leaf: Inner;
      self: Outer[];
    }
    const nest = (leafType: z.ZodType): z.ZodType<Outer> => {
      const inner: z.ZodType<Inner> = z.lazy(() =>
        z.object({ v: leafType, self: z.array(inner) }),
      );
      const outer: z.ZodType<Outer> = z.lazy(() =>
        z.object({ leaf: inner, self: z.array(outer) }),
      );
      return outer;
    };

    const one = convert(
      withOpenApi(z.object({ root: nest(z.string()) }), 'OneDto'),
      { schemaType: 'output' },
    );
    // Same outer shape, different leaf: the aborting case.
    const two = convert(
      withOpenApi(z.object({ root: nest(z.number()) }), 'TwoDto'),
      { schemaType: 'output' },
    );

    const generated = (result: typeof one): string[] =>
      Object.keys(result?.components ?? {}).filter((name) =>
        /^RocketsRef_[0-9a-f]{8}$/.test(name),
      );
    expect(generated(one)).toHaveLength(2);
    expect(generated(two)).toHaveLength(2);
    // Four distinct components: nothing was reused across the two owners.
    expect(new Set([...generated(one), ...generated(two)]).size).toBe(4);
  });

  // The other half of a content-addressed name: the SAME nested schema
  // reached from two different parents is one component, not two.
  it('one shared leaf under two different parents is one component', () => {
    const convert = createRocketsStandardSchemaConverter();
    interface Leaf {
      v: string;
      self: Leaf[];
    }
    const leaf: z.ZodType<Leaf> = z.lazy(() =>
      z.object({ v: z.string(), self: z.array(leaf) }),
    );
    interface Parent {
      leaf: Leaf;
      self: Parent[];
    }
    const parent = (tag: string): z.ZodType<Parent> => {
      const node: z.ZodType<Parent> = z.lazy(() =>
        z.object({ leaf, tag: z.literal(tag), self: z.array(node) }),
      );
      return node;
    };

    const first = convert(
      withOpenApi(z.object({ root: parent('a') }), 'P1Dto'),
      { schemaType: 'output' },
    );
    const second = convert(
      withOpenApi(z.object({ root: parent('b') }), 'P2Dto'),
      { schemaType: 'output' },
    );

    const shared = Object.keys(first?.components ?? {}).filter((name) =>
      Object.keys(second?.components ?? {}).includes(name),
    );
    expect(shared).toHaveLength(1);
    expect(shared[0]).toMatch(/^RocketsRef_[0-9a-f]{8}$/);
  });

  // A JSON column or a recursive field in a response reaches the
  // converter twice on an ordinary resource: once for `read`, once inside
  // the paginated envelope of `list`. The generated name is prefixed with
  // the OWNER's id, so the same lifted definition was named twice — and
  // the owner's own component, whose `$ref` moved with it, then failed
  // the two-shapes check and took the whole document with it.
  it('a lifted definition keeps one name across owners', () => {
    const convert = createRocketsStandardSchemaConverter();
    const jsonDto = withOpenApi(
      z.object({ id: z.string(), data: z.json() }),
      'JsonDto',
    );

    const read = convert(jsonDto, { schemaType: 'output' });
    const list = convert(buildPaginatedSchema(jsonDto, 'ctx'), {
      schemaType: 'output',
    });

    const generated = Object.keys(read?.components ?? {}).find((name) =>
      /Ref_[0-9a-f]{8}$/.test(name),
    );
    expect(generated).toMatch(/^RocketsRef_[0-9a-f]{8}$/);
    // Same name on the second pass, so `JsonDto` serializes identically
    // and the document builds.
    expect(Object.keys(list?.components ?? {})).toContain(generated);
    expect(JSON.stringify(list?.components?.['JsonDto'])).toBe(
      JSON.stringify(read?.components?.['JsonDto']),
    );
  });

  it('a recursive schema and an authored Ref-style id coexist across conversions', () => {
    for (const order of ['authored-first', 'recursive-first'] as const) {
      const convert = createRocketsStandardSchemaConverter();
      interface TreeNode {
        name: string;
        children: TreeNode[];
      }
      const node: z.ZodType<TreeNode> = z.lazy(() =>
        z.object({ name: z.string(), children: z.array(node) }),
      );
      const tree = withOpenApi(z.object({ root: node }), 'TreeDto');
      const owned = withOpenApi(
        z.object({ mine: z.literal('AUTHORED') }),
        'TreeDtoRef0',
      );

      const first = order === 'authored-first' ? owned : tree;
      const second = order === 'authored-first' ? tree : owned;
      const components = {
        ...convert(first, { schemaType: 'output' })?.components,
        ...convert(second, { schemaType: 'output' })?.components,
      };

      // Both survive with their own names and shapes, whatever the order.
      expect(components['TreeDtoRef0']).toEqual({
        type: 'object',
        properties: { mine: { type: 'string', enum: ['AUTHORED'] } },
        required: ['mine'],
        additionalProperties: false,
      });
      const root = components['TreeDto'] as {
        properties: Record<string, { $ref: string }>;
      };
      const ref = root.properties.root!.$ref;
      const generated = ref.slice(ref.lastIndexOf('/') + 1);
      expect(generated).toMatch(/^RocketsRef_[0-9a-f]{8}$/);
      expect(components[generated]).toBeDefined();
    }
  });

  // The residual deliberate collision: an author id landing EXACTLY on a
  // hash the document already generated. Unresolvable — the generated
  // refs are in Swagger's hands and the author's id is a wire contract —
  // so it must be THIS error, not the request/response two-shapes one.
  it('an author id equal to an already-generated name is a precise error', () => {
    const convert = createRocketsStandardSchemaConverter();
    interface TreeNode {
      name: string;
      children: TreeNode[];
    }
    const node: z.ZodType<TreeNode> = z.lazy(() =>
      z.object({ name: z.string(), children: z.array(node) }),
    );
    const tree = withOpenApi(z.object({ root: node }), 'TreeDto');
    const treeComponents =
      convert(tree, { schemaType: 'output' })?.components ?? {};
    const generated = Object.keys(treeComponents).find((n) =>
      /^RocketsRef_[0-9a-f]{8}$/.test(n),
    );
    expect(generated).toBeDefined();

    const malicious = withOpenApi(
      z.object({ mine: z.literal('AUTHORED') }),
      generated as string,
    );
    expect(() => convert(malicious, { schemaType: 'output' })).toThrow(
      /collides with a name this document generated for a recursive definition lifted from "TreeDto"/,
    );
  });

  it('never lands a qualified name on one an author already owns', () => {
    const convert = createRocketsStandardSchemaConverter();

    interface TreeNode {
      name: string;
      children: TreeNode[];
    }
    const node: z.ZodType<TreeNode> = z.lazy(() =>
      z.object({ name: z.string(), children: z.array(node) }),
    );

    // The author owns the exact name the qualifier would invent for the
    // lazy node. Both land in ONE conversion, so nothing downstream can
    // notice the clash: before this guard the generated name overwrote the
    // author's entry and `root` silently documented the author's shape.
    const owned = withOpenApi(
      z.object({ mine: z.literal('AUTHORED') }),
      'TreeDtoRef0',
    );
    const tree = withOpenApi(z.object({ root: node, other: owned }), 'TreeDto');

    const components =
      convert(tree, { schemaType: 'output' })?.components ?? {};
    const refOf = (property: string): string => {
      const root = components['TreeDto'] as {
        properties: Record<string, { $ref: string }>;
      };
      const ref = root.properties[property]!.$ref;
      return ref.slice(ref.lastIndexOf('/') + 1);
    };

    // The author's component keeps its name AND its shape.
    expect(components['TreeDtoRef0']).toEqual({
      type: 'object',
      properties: { mine: { type: 'string', enum: ['AUTHORED'] } },
      required: ['mine'],
      additionalProperties: false,
    });
    expect(refOf('other')).toBe('TreeDtoRef0');

    // The recursive node took a free name and still points at itself.
    const generated = refOf('root');
    expect(generated).not.toBe('TreeDtoRef0');
    expect(components[generated]).toBeDefined();
    expect(JSON.stringify(components[generated])).toContain(generated);
  });
});
