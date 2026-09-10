import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Get, Module, Post, Sse, Version } from '@nestjs/common';
import { Operation, withOpenApi } from '@concepta/nestjs-core';
import { Transactional } from '@concepta/nestjs-repository';
import { EMPTY } from 'rxjs';

import { ResourceKind } from '../../domain/interfaces/resource-kind.enum';
import type { CompiledOperationDescriptor } from '../../domain/interfaces/operation-resource.interface';
import { readSchemaId } from '../../common/utils/open-api-schema.util';
import {
  buildAppRegistrationPlan,
  isCrudResource,
} from './aggregate-resources';
import { defineModuleResource } from './define-module-resource';
import { defineResource } from './define-resource';
import {
  defineOperationResource,
  isOperationResource,
} from './define-operation-resource';
import { operationBodySchema } from './operation-resource/operation-body-schema';
import { validateRouteCollisions } from './planner/validate-route-collisions';
import { operationResource } from '../../zod/zod-operation-resource';

/** Component id of a compiled output schema, or `undefined` when the op opted out. */
function outputSchemaId(output: CompiledOperationDescriptor['output']) {
  return output === false ? undefined : readSchemaId(output);
}

describe('defineOperationResource', () => {
  it('builds an OperationResource with a generated controller', () => {
    const inputSchema = withOpenApi(
      operationBodySchema(z.object({ name: z.string() })),
      'EchoInput',
    );
    const outputSchema = withOpenApi(
      z.object({ name: z.string(), ok: z.boolean() }),
      'EchoOutput',
    );

    const bundle = defineOperationResource({
      path: 'api/echo',
      tags: ['Echo'],
      operations: {
        echo: {
          key: 'echo',
          method: 'POST',
          path: '',
          status: 200,
          inputSchema,
          output: outputSchema,
          handler: ({ input }) => {
            if (
              typeof input !== 'object' ||
              input === null ||
              !('name' in input) ||
              typeof input.name !== 'string'
            ) {
              throw new Error('EchoInput missing name');
            }
            return { name: input.name, ok: true };
          },
        },
      },
    });

    expect(isOperationResource(bundle)).toBe(true);
    expect(bundle.kind).toBe(ResourceKind.Operation);
    expect(bundle.controller).toBeTypeOf('function');
    expect(bundle.definition.operations.echo.method).toBe('POST');
  });

  it('refuses an empty operations map', () => {
    expect(() =>
      defineOperationResource({ path: 'api/empty', operations: {} }),
    ).toThrow(/at least one operation/);
  });

  // Omitting the response contract is no longer a runtime error — it is
  // unrepresentable. `output: Type | false` is required, so the compiler
  // rejects it. `@ts-expect-error` pins that: if the field ever became
  // optional again, this line would stop erroring and the test fails.
  it('makes an omitted response contract a compile error', () => {
    const build = () =>
      defineOperationResource({
        path: 'api/leak',
        operations: {
          // @ts-expect-error `output` is required — omitting it would
          // allow a response to leak.
          ping: {
            key: 'ping',
            method: 'GET',
            path: '',
            status: 200,
            handler: () => ({ ok: true }),
          },
        },
      });
    // Still constructs at runtime; the guarantee is the type, not a throw.
    expect(typeof build).toBe('function');
  });

  it('rejects status 204 with an output schema', () => {
    const outputSchema = withOpenApi(
      z.object({ ok: z.boolean() }),
      'NoContentOutput',
    );
    expect(() =>
      defineOperationResource({
        path: 'api/nc',
        operations: {
          clear: {
            key: 'clear',
            method: 'DELETE',
            path: '',
            status: 204,
            output: outputSchema,
            handler: () => ({ ok: true }),
          },
        },
      }),
    ).toThrow(/status 204/);
  });

  it('does not auto-register a handler already listed in providers', () => {
    class EchoHandler {
      handle() {
        return { ok: true };
      }
    }

    const bundle = defineOperationResource({
      path: 'api/echo-prov',
      providers: [
        { provide: EchoHandler, useValue: { handle: () => ({ ok: true }) } },
      ],
      operations: {
        ping: {
          key: 'ping',
          method: 'GET',
          path: '',
          status: 200,
          output: false,
          handler: EchoHandler,
        },
      },
    });

    expect(bundle.providers).toHaveLength(1);
    expect(bundle.providers[0]).toEqual({
      provide: EchoHandler,
      useValue: expect.objectContaining({ handle: expect.any(Function) }),
    });
  });

  it('does not auto-register a handler exported by an imported module', () => {
    class ImportedHandler {
      handle() {
        return { ok: true };
      }
    }

    @Module({
      providers: [ImportedHandler],
      exports: [ImportedHandler],
    })
    class HandlerHostModule {}

    const bundle = defineOperationResource({
      path: 'api/echo-import',
      imports: [HandlerHostModule],
      operations: {
        ping: {
          key: 'ping',
          method: 'GET',
          path: '',
          status: 200,
          output: false,
          handler: ImportedHandler,
        },
      },
    });

    // The handler CLASS is not re-registered — that is what would shadow
    // the imported provider. What IS registered is a local alias
    // (`{ provide: Symbol, useExisting: ImportedHandler }`) so the route
    // can resolve strictly instead of falling back to a global,
    // last-wins scan.
    expect(bundle.providers).not.toContain(ImportedHandler);
    expect(bundle.providers).toHaveLength(1);
    expect(bundle.providers[0]).toMatchObject({
      useExisting: ImportedHandler,
    });
    expect(bundle.imports).toEqual([HandlerHostModule]);
  });

  it('does not auto-register a handler exported by a DynamicModule import', () => {
    class DynHandler {
      handle() {
        return { ok: true };
      }
    }

    @Module({})
    class DynHostModule {}

    const bundle = defineOperationResource({
      path: 'api/echo-dyn',
      imports: [
        {
          module: DynHostModule,
          providers: [DynHandler],
          exports: [DynHandler],
        },
      ],
      operations: {
        ping: {
          key: 'ping',
          method: 'GET',
          path: '',
          status: 200,
          output: false,
          handler: DynHandler,
        },
      },
    });

    // As above: an alias, never the class itself.
    expect(bundle.providers).not.toContain(DynHandler);
    expect(bundle.providers[0]).toMatchObject({ useExisting: DynHandler });
  });
});

describe('operationResource (zod)', () => {
  it('compiles read + write into an OperationResource', () => {
    const bundle = operationResource({
      path: 'api/widgets',
      tags: ['Widgets'],
      public: true,
      operations: (op) => ({
        ping: op.read({
          path: '',
          summary: 'Ping',
          output: z.object({ ok: z.literal(true) }),
          handler: () => ({ ok: true as const }),
        }),
        shout: op.write({
          method: 'POST',
          status: 201,
          input: z.object({ text: z.string().min(1) }),
          output: z.object({ text: z.string() }),
          handler: ({ input }) => ({
            text: input.text.toUpperCase(),
          }),
        }),
      }),
    });

    expect(isOperationResource(bundle)).toBe(true);
    expect(bundle.definition.operations.ping.method).toBe('GET');
    expect(bundle.definition.operations.ping.path).toBe('');
    expect(bundle.definition.operations.shout.method).toBe('POST');
    expect(bundle.definition.operations.shout.path).toBe('shout');
    expect(bundle.definition.operations.shout.status).toBe(201);
    // Body input and output are NAMED components; the ids are what the
    // document `$ref`s and what the planner's uniqueness check claims.
    const { inputSchema, output } = bundle.definition.operations.shout;
    expect(inputSchema).toBeDefined();
    expect(readSchemaId(inputSchema as z.ZodType)).toBe(
      'ApiWidgets_Post_ShoutInput',
    );
    expect(outputSchemaId(output)).toBe('ApiWidgets_Post_ShoutOutput');
  });

  it('leaves a query input bridged but unnamed', () => {
    const bundle = operationResource({
      path: 'api/lookup',
      public: true,
      operations: (op) => ({
        find: op.read({
          input: z.object({ term: z.string() }),
          output: z.object({ term: z.string() }),
          handler: ({ input }) => ({ term: input.term }),
        }),
      }),
    });
    const { inputSchema } = bundle.definition.operations.find;
    expect(inputSchema).toBeDefined();
    // No id: a query parameter cannot carry a `$ref`, so the document
    // expands the schema one parameter per property instead.
    expect(readSchemaId(inputSchema as z.ZodType)).toBeUndefined();
  });

  it('defaults operation path to the key', () => {
    const bundle = operationResource({
      path: 'api/ops',
      public: true,
      operations: (op) => ({
        health: op.read({
          handler: () => ({ ok: true }),
          output: z.object({ ok: z.boolean() }),
        }),
      }),
    });
    expect(bundle.definition.operations.health.path).toBe('health');
  });

  it('rejects reserved and invalid operation keys', () => {
    expect(() =>
      operationResource({
        path: 'api/bad',
        operations: (op) => ({
          'bad-key': op.read({ output: false, handler: () => undefined }),
        }),
      }),
    ).toThrow(/not a valid identifier/);

    expect(() =>
      operationResource({
        path: 'api/bad',
        operations: (op) => ({
          constructor: op.read({ output: false, handler: () => undefined }),
        }),
      }),
    ).toThrow(/reserved/);

    expect(() =>
      operationResource({
        path: 'api/bad',
        operations: (op) => ({
          moduleRef: op.read({ output: false, handler: () => undefined }),
        }),
      }),
    ).toThrow(/reserved/);

    expect(() =>
      operationResource({
        path: 'api/bad',
        operations: (op) => ({
          toString: op.read({ output: false, handler: () => undefined }),
        }),
      }),
    ).toThrow(/reserved/);
  });

  it('rejects params keys that are not on the path', () => {
    expect(() =>
      operationResource({
        path: 'pets/:petId',
        params: z.object({ ownerId: z.uuid() }),
        operations: (op) => ({
          transfer: op.write({
            output: false,
            handler: () => undefined,
          }),
        }),
      }),
    ).toThrow(/params.ownerId/);
  });

  it('compiles paramsSchema when params schema matches the path', () => {
    const bundle = operationResource({
      path: 'pets/:petId',
      params: z.object({ petId: z.uuid() }),
      public: true,
      operations: (op) => ({
        ping: op.read({
          path: '',
          output: z.object({ id: z.string() }),
          handler: ({ params }) => ({ id: params.petId }),
        }),
      }),
    });
    const { paramsSchema } = bundle.definition;
    expect(paramsSchema).toBeDefined();
    // Bridged, never named: path params document one by one.
    expect(readSchemaId(paramsSchema as z.ZodType)).toBeUndefined();
  });

  it('rejects 204 with an output schema', () => {
    expect(() =>
      operationResource({
        path: 'api/nc',
        public: true,
        operations: (op) => ({
          clear: op.delete({
            path: '',
            status: 204,
            output: z.object({ ok: z.boolean() }),
            handler: () => ({ ok: true }),
          }),
        }),
      }),
    ).toThrow(/status 204/);
  });

  it('allows output: false with status 204', () => {
    const bundle = operationResource({
      path: 'api/nc',
      public: true,
      operations: (op) => ({
        clear: op.delete({
          path: '',
          status: 204,
          output: false,
          handler: () => undefined,
        }),
      }),
    });
    expect(bundle.definition.operations.clear.output).toBe(false);
  });

  it('compiles delete (query-sourced) and write PUT', () => {
    const bundle = operationResource({
      path: 'api/items',
      public: true,
      operations: (op) => ({
        remove: op.delete({
          input: z.object({ force: z.coerce.boolean().optional() }),
          output: z.object({ removed: z.boolean() }),
          handler: ({ input }) => ({ removed: input.force === true }),
        }),
        replace: op.write({
          method: 'PUT',
          input: z.object({ name: z.string() }),
          output: z.object({ name: z.string() }),
          handler: ({ input }) => ({ name: input.name }),
        }),
      }),
    });

    expect(bundle.definition.operations.remove.method).toBe('DELETE');
    expect(bundle.definition.operations.remove.path).toBe('remove');
    expect(bundle.definition.operations.replace.method).toBe('PUT');
    expect(bundle.definition.operations.replace.path).toBe('replace');
  });

  /**
   * The GET-only invariant of `op.sse()` used to be a comment. Nest's
   * route decorators are unmerged `Reflect.defineMetadata` writes and
   * `applyDecorators` runs in order, so a consumer decorator appended
   * after `@Sse()` silently won the `METHOD_METADATA` slot while
   * `SSE_METADATA` stayed `true` — a POST route in SSE response mode,
   * invisible to every route check because they read the DECLARED
   * method. These assert the definition-time throw on the FINAL
   * registered metadata, which is what closes every authoring path.
   */
  describe('op.sse() route-shape enforcement', () => {
    it('accepts a plain SSE operation', () => {
      expect(() =>
        operationResource({
          path: 'api/stream-ok',
          public: true,
          operations: (op) => ({
            ticks: op.sse({ handler: () => EMPTY }),
          }),
        }),
      ).not.toThrow();
    });

    it('defaults an SSE operation to GET', () => {
      const bundle = operationResource({
        path: 'api/stream-method',
        public: true,
        operations: (op) => ({
          ticks: op.sse({ handler: () => EMPTY }),
        }),
      });
      expect(bundle.definition.operations.ticks.method).toBe('GET');
      expect(bundle.definition.operations.ticks.responseMode).toBe('sse');
    });

    it('rejects a consumer decorator that overwrites the SSE route method', () => {
      expect(() =>
        operationResource({
          path: 'api/stream-post',
          public: true,
          operations: (op) => ({
            ticks: op.sse({
              decorators: [Post('x')],
              handler: () => EMPTY,
            }),
          }),
        }),
      ).toThrow(/declares method GET but registers as POST/);
    });

    it('rejects Transactional() on an SSE operation', () => {
      expect(() =>
        operationResource({
          path: 'api/stream-tx',
          public: true,
          operations: (op) => ({
            ticks: op.sse({
              decorators: [Transactional()],
              handler: () => EMPTY,
            }),
          }),
        }),
      ).toThrow(/silent no-op/);
    });

    it('rejects a consumer decorator that overwrites the SSE route PATH', () => {
      // The method-hijack test below passes for the wrong reason if only
      // METHOD_METADATA is checked: `Post('x')` writes both slots, so it
      // trips the method branch first. `Get('hijacked')` keeps the method
      // legal and moves ONLY the path — the route still serves, at an
      // address no route audit knows about.
      expect(() =>
        operationResource({
          path: 'api/stream-path',
          public: true,
          operations: (op) => ({
            ticks: op.sse({
              path: 'declared',
              decorators: [Get('hijacked')],
              handler: () => EMPTY,
            }),
          }),
        }),
      ).toThrow(/declares path "declared" but registers as/);
    });

    it('rejects a route-decorator hijack on a NON-SSE operation too', () => {
      // Same defect class, no SSE involved: the served route is POST
      // /hijacked while every collision check files it as GET /declared.
      expect(() =>
        operationResource({
          path: 'api/json-hijack',
          public: true,
          operations: (op) => ({
            thing: op.read({
              path: 'declared',
              output: false,
              decorators: [Post('hijacked')],
              handler: () => undefined,
            }),
          }),
        }),
      ).toThrow(/declares method GET but registers as POST/);
    });

    it('rejects resource-level Transactional() on a resource with an SSE op', () => {
      // Class-level decorators reach every route on the controller, so
      // reading interceptor metadata off the method alone missed this.
      expect(() =>
        operationResource({
          path: 'api/stream-class-tx',
          public: true,
          decorators: [Transactional() as ClassDecorator],
          operations: (op) => ({
            ticks: op.sse({ handler: () => EMPTY }),
          }),
        }),
      ).toThrow(/silent no-op/);
    });

    it('rejects a hand-built SSE descriptor declaring an output schema', () => {
      const outputSchema = withOpenApi(z.object({ ok: z.boolean() }), 'SseOut');
      expect(() =>
        defineOperationResource({
          path: 'api/stream-raw-output',
          public: true,
          operations: {
            ticks: {
              key: 'ticks',
              method: 'GET',
              path: '',
              status: 200,
              output: outputSchema,
              responseMode: 'sse',
              handler: () => EMPTY,
            },
          },
        }),
      ).toThrow(/output step never runs/);
    });

    it('rejects @Sse() applied to a non-SSE operation', () => {
      expect(() =>
        operationResource({
          path: 'api/stream-smuggled',
          public: true,
          operations: (op) => ({
            ticks: op.read({
              output: false,
              decorators: [Sse('x')],
              handler: () => undefined,
            }),
          }),
        }),
      ).toThrow(/not declared with `op.sse\(\)`/);
    });

    it('rejects a hand-built non-GET descriptor in SSE response mode', () => {
      expect(() =>
        defineOperationResource({
          path: 'api/stream-raw',
          public: true,
          operations: {
            ticks: {
              key: 'ticks',
              method: 'POST',
              path: '',
              status: 200,
              output: false,
              responseMode: 'sse',
              handler: () => EMPTY,
            },
          },
        }),
      ).toThrow(/must be GET/);
    });

    it('rejects a hand-built SSE descriptor declaring transactional', () => {
      expect(() =>
        defineOperationResource({
          path: 'api/stream-raw-tx',
          public: true,
          operations: {
            ticks: {
              key: 'ticks',
              method: 'GET',
              path: '',
              status: 200,
              output: false,
              transactional: true,
              responseMode: 'sse',
              handler: () => EMPTY,
            },
          },
        }),
      ).toThrow(/silent no-op/);
    });
  });

  it('registers through buildAppRegistrationPlan as a nest module', () => {
    const ops = operationResource({
      path: 'api/ops',
      public: true,
      operations: (op) => ({
        health: op.read({
          path: '',
          handler: () => ({ ok: true }),
          output: z.object({ ok: z.boolean() }),
        }),
      }),
    });
    const moduleSlice = defineModuleResource({
      providers: [],
    });

    const plan = buildAppRegistrationPlan({
      resources: [ops, moduleSlice],
    });

    expect(plan.nestModules).toHaveLength(2);
    expect(plan.crudResources).toHaveLength(0);
    expect(isCrudResource(ops)).toBe(false);
  });

  it('rejects cross-resource route collisions at plan time', () => {
    class WidgetEntity {
      id!: string;
    }
    const crud = defineResource({
      key: 'widget',
      entity: WidgetEntity,
      path: 'widgets',
      operations: [Operation.List, Operation.Read],
    });
    const ops = operationResource({
      path: 'widgets',
      public: true,
      operations: (op) => ({
        // GET /widgets — collides with CRUD list
        root: op.read({
          path: '',
          output: z.object({ ok: z.boolean() }),
          handler: () => ({ ok: true }),
        }),
      }),
    });

    expect(() =>
      validateRouteCollisions({
        generatedResources: [crud],
        manualResources: [],
        operationBundles: [ops],
      }),
    ).toThrow(/duplicate route GET/);
  });

  it('rejects public:false ops on a public resource at controller build', () => {
    expect(() =>
      defineOperationResource({
        path: 'api/broken',
        public: true,
        operations: {
          secret: {
            key: 'secret',
            method: 'GET',
            path: '',
            status: 200,
            public: false,
            output: false,
            handler: () => ({ ok: true }),
          },
        },
      }),
    ).toThrow(/cannot be more private/);
  });

  // Every schema a hand-built descriptor carries must be able to BOTH
  // validate and document. A body or output must be a named component;
  // a query or params schema must at least be bridged. Each is checked
  // at definition time, so a schema extended AFTER `withOpenApi()` (a
  // clone with no id) fails the resource, not the first request.
  describe('hand-built descriptor schema contract', () => {
    const build = (
      operation: Partial<CompiledOperationDescriptor> & {
        readonly method: CompiledOperationDescriptor['method'];
        readonly output: CompiledOperationDescriptor['output'];
      },
      paramsSchema?: z.ZodObject,
    ) =>
      defineOperationResource({
        path: 'api/contract/:id',
        paramsSchema,
        operations: {
          run: {
            key: 'run',
            path: '',
            status: 200,
            handler: () => ({ ok: true }),
            ...operation,
          },
        },
      });

    it('rejects an unnamed body input', () => {
      expect(() =>
        build({
          method: 'POST',
          inputSchema: z.object({ name: z.string() }),
          output: false,
        }),
      ).toThrow(/op "run" input: schema is not a named OpenAPI component/);
    });

    it('rejects a body input whose id was lost to a chained call', () => {
      const extended = withOpenApi(
        z.object({ name: z.string() }),
        'ContractInput',
      ).extend({ extra: z.string() });
      expect(() =>
        build({ method: 'POST', inputSchema: extended, output: false }),
      ).toThrow(/not a named OpenAPI component/);
    });

    it('rejects an unnamed output', () => {
      expect(() =>
        build({ method: 'GET', output: z.object({ ok: z.boolean() }) }),
      ).toThrow(/op "run" output: schema is not a named OpenAPI component/);
    });

    it('rejects an output that is not a zod schema', () => {
      class BareDto {}
      expect(() =>
        build({ method: 'GET', output: BareDto as unknown as z.ZodType }),
      ).toThrow(/output: expected a zod schema, got class\/function BareDto/);
    });

    // zod 4 exposes `~standard.jsonSchema` on EVERY schema, so a raw
    // query / params object is already bridged and `withOpenApi(schema)`
    // without an id is the same instance. The bridge guard therefore
    // only fires for a Standard Schema surface with no JSON Schema
    // half — modelled here by stripping it off a controlled fixture.
    const withoutBridge = <T extends z.ZodObject>(schema: T): T => {
      const { version, vendor, validate } = schema['~standard'];
      Object.defineProperty(schema, '~standard', {
        value: { version, vendor, validate },
        configurable: true,
      });
      return schema;
    };

    it('accepts a raw zod query input and params schema (native bridge)', () => {
      expect(() =>
        build(
          {
            method: 'GET',
            inputSchema: z.object({ term: z.string() }),
            output: false,
          },
          z.object({ id: z.string() }),
        ),
      ).not.toThrow();
    });

    it('rejects a query input with no JSON Schema bridge', () => {
      expect(() =>
        build({
          method: 'GET',
          inputSchema: withoutBridge(z.object({ term: z.string() })),
          output: false,
        }),
      ).toThrow(/input \(query\): schema has no OpenAPI bridge/);
    });

    it('rejects a params schema with no JSON Schema bridge', () => {
      expect(() =>
        build(
          { method: 'GET', output: false },
          withoutBridge(z.object({ id: z.string() })),
        ),
      ).toThrow(/"api\/contract\/:id" params: schema has no OpenAPI bridge/);
    });

    it('accepts a bridged query input and params schema without ids', () => {
      expect(() =>
        build(
          {
            method: 'GET',
            inputSchema: withOpenApi(z.object({ term: z.string() })),
            output: withOpenApi(z.object({ ok: z.boolean() }), 'ContractOut'),
          },
          withOpenApi(z.object({ id: z.string() })),
        ),
      ).not.toThrow();
    });
  });

  it('rejects duplicate method+path pairs', () => {
    expect(() =>
      defineOperationResource({
        path: 'api/dup',
        operations: {
          a: {
            key: 'a',
            method: 'GET',
            path: 'x',
            status: 200,
            output: false,
            handler: () => ({ ok: true }),
          },
          b: {
            key: 'b',
            method: 'GET',
            path: 'x',
            status: 200,
            output: false,
            handler: () => ({ ok: true }),
          },
        },
      }),
    ).toThrow(/duplicate route/);
  });

  it('rejects reserved and invalid operation keys in the lower-level factory', () => {
    expect(() =>
      defineOperationResource({
        path: 'api/bad',
        operations: {
          'bad-key': {
            key: 'bad-key',
            method: 'GET',
            path: '',
            status: 200,
            output: false,
            handler: () => undefined,
          },
        },
      }),
    ).toThrow(/not a valid identifier/);

    expect(() =>
      defineOperationResource({
        path: 'api/bad',
        operations: {
          moduleRef: {
            key: 'moduleRef',
            method: 'GET',
            path: '',
            status: 200,
            output: false,
            handler: () => undefined,
          },
        },
      }),
    ).toThrow(/reserved/);
  });

  it('does not reject version-separated CRUD routes when no operation resource exists', () => {
    class WidgetEntity {
      id!: string;
    }

    const v1 = {
      crud: {
        controller: {
          class: WidgetEntity,
          path: 'widgets',
          version: '1',
        },
        operations: [{ operation: Operation.List }],
      },
    };
    const v2 = {
      crud: {
        controller: {
          class: WidgetEntity,
          path: 'widgets',
          version: '2',
        },
        operations: [{ operation: Operation.List }],
      },
    };

    expect(() =>
      validateRouteCollisions({
        generatedResources: [],
        manualResources: [v1, v2],
        operationBundles: [],
      }),
    ).not.toThrow();
  });

  it('does not reject version-separated manual routes when operation resources are present', () => {
    class WidgetEntity {
      id!: string;
    }

    const v1 = {
      crud: {
        controller: {
          class: WidgetEntity,
          path: 'widgets',
          version: '1',
        },
        operations: [{ operation: Operation.List }],
      },
    };
    const v2 = {
      crud: {
        controller: {
          class: WidgetEntity,
          path: 'widgets',
          version: '2',
        },
        operations: [{ operation: Operation.List }],
      },
    };
    const ops = operationResource({
      path: 'ops',
      public: true,
      operations: (op) => ({
        health: op.read({
          output: z.object({ ok: z.boolean() }),
          handler: () => ({ ok: true }),
        }),
      }),
    });

    expect(() =>
      validateRouteCollisions({
        generatedResources: [],
        manualResources: [v1, v2],
        operationBundles: [ops],
      }),
    ).not.toThrow();
  });

  it('rejects structured static-vs-param route overlap', () => {
    class UserEntity {
      id!: string;
    }

    const crud = defineResource({
      key: 'user',
      entity: UserEntity,
      path: 'users',
      operations: [Operation.Read],
    });
    const ops = operationResource({
      path: 'users',
      public: true,
      operations: (op) => ({
        me: op.read({
          output: z.object({ ok: z.boolean() }),
          handler: () => ({ ok: true }),
        }),
      }),
    });

    expect(() =>
      validateRouteCollisions({
        generatedResources: [crud],
        manualResources: [],
        operationBundles: [ops],
      }),
    ).toThrow(/duplicate route GET/);
  });
});

/**
 * Regressions for the review findings on the operation-resource surface:
 * the documented `{ useClass }` form, transitive module re-exports,
 * operation-id / DTO-name uniqueness, and per-operation route
 * dimensions.
 */
describe('operation resource — review regressions', () => {
  class UseClassHandler {
    // Instance-field `handle` — the shape no runtime check can tell apart
    // from a plain function, which is why `{ useClass }` exists.
    handle = () => ({ ok: true });
  }

  it('accepts the documented { useClass } handler on the zod path', () => {
    expect(() =>
      operationResource({
        path: 'api/tagged',
        operations: (op) => ({
          run: op.read({
            output: z.object({ ok: z.boolean() }),
            handler: { useClass: UseClassHandler },
          }),
        }),
      }),
    ).not.toThrow();
  });

  it('registers the { useClass } target as a provider', () => {
    const bundle = operationResource({
      path: 'api/tagged-provider',
      operations: (op) => ({
        run: op.read({
          output: z.object({ ok: z.boolean() }),
          handler: { useClass: UseClassHandler },
        }),
      }),
    });

    expect(bundle.providers).toContain(UseClassHandler);
  });

  it('rejects a handler that is neither function, class nor { useClass }', () => {
    expect(() =>
      operationResource({
        path: 'api/bad-handler',
        operations: (op) => ({
          run: op.read({
            output: z.object({ ok: z.boolean() }),
            // Deliberately malformed: the definition must fail fast
            // rather than produce a controller that throws per request.
            handler: { nope: true } as never,
          }),
        }),
      }),
    ).toThrow(/must be a function, an injectable class, or/);
  });

  // Nest re-exports transitively: `exports: [InnerModule]` publishes
  // everything Inner exports. Reading only direct entries made the
  // handler look unsupplied, so it was registered locally — shadowing
  // the imported provider and losing its module-private dependencies.
  it('sees a handler exported through a re-exported module', () => {
    class TransitiveHandler {
      handle() {
        return { ok: true };
      }
    }

    @Module({
      providers: [TransitiveHandler],
      exports: [TransitiveHandler],
    })
    class InnerModule {}

    @Module({ imports: [InnerModule], exports: [InnerModule] })
    class OuterModule {}

    const bundle = operationResource({
      path: 'api/transitive',
      imports: [OuterModule],
      operations: (op) => ({
        run: op.read({
          output: z.object({ ok: z.boolean() }),
          handler: TransitiveHandler,
        }),
      }),
    });

    expect(bundle.providers).not.toContain(TransitiveHandler);
  });

  it('sees a handler re-exported through a dynamic module', () => {
    class DynamicHandler {
      handle() {
        return { ok: true };
      }
    }

    @Module({ providers: [DynamicHandler], exports: [DynamicHandler] })
    class InnerDynamicModule {}

    const bundle = operationResource({
      path: 'api/transitive-dynamic',
      imports: [
        {
          module: class OuterDynamicModule {},
          imports: [InnerDynamicModule],
          exports: [InnerDynamicModule],
        },
      ],
      operations: (op) => ({
        run: op.read({
          output: z.object({ ok: z.boolean() }),
          handler: DynamicHandler,
        }),
      }),
    });

    expect(bundle.providers).not.toContain(DynamicHandler);
  });

  // Same base path, same method, same key — distinct only by explicit
  // path. Both used to receive one operation ID and one DTO name, so
  // Swagger pointed both routes at a single component.
  it('discriminates operation ids and DTO names by explicit path', () => {
    const build = (path: string) =>
      operationResource({
        path: 'same-base',
        operations: (op) => ({
          action: op.read({
            path,
            output: z.object({ value: z.string() }),
            handler: () => ({ value: path }),
          }),
        }),
      });

    const one = build('one');
    const two = build('two');

    const oneId = outputSchemaId(one.definition.operations.action.output);
    const twoId = outputSchemaId(two.definition.operations.action.output);
    expect(oneId).toBeDefined();
    expect(oneId).not.toBe(twoId);
  });

  it('keeps the short name when the path is just the key', () => {
    const bundle = operationResource({
      path: 'plain',
      operations: (op) => ({
        action: op.read({
          output: z.object({ value: z.string() }),
          handler: () => ({ value: 'x' }),
        }),
      }),
    });

    expect(outputSchemaId(bundle.definition.operations.action.output)).toBe(
      'Plain_Get_ActionOutput',
    );
  });
});

/**
 * A CRUD route on version 1 and an operation route on version 2 share a
 * METHOD and a path but are routed separately by Nest. The collision
 * validator discarded operation-level dimensions, so it rejected a
 * configuration that works.
 */
describe('operation resource — route dimensions', () => {
  class VersionedEntity {
    id!: string;
  }

  it('accepts a versioned operation beside a same-path v1 CRUD route', () => {
    const crudV1 = {
      crud: {
        controller: {
          class: VersionedEntity,
          path: 'widgets',
          version: '1',
        },
        operations: [{ operation: Operation.List }],
      },
    };

    const ops = operationResource({
      path: 'widgets',
      operations: (op) => ({
        list: op.read({
          path: '',
          // Nest's `Version` is a METHOD decorator (it always writes to
          // `descriptor.value`), so per-operation `decorators` is where
          // it belongs. The planner reads it back off the generated
          // controller's handler.
          decorators: [Version('2')],
          output: z.object({ ok: z.boolean() }),
          handler: () => ({ ok: true }),
        }),
      }),
    });

    expect(() =>
      validateRouteCollisions({
        generatedResources: [],
        manualResources: [crudV1],
        operationBundles: [ops],
      }),
    ).not.toThrow();
  });

  it('still rejects two unversioned routes on the same path', () => {
    const crud = defineResource<VersionedEntity>({
      key: 'widget',
      entity: VersionedEntity,
      path: 'widgets',
      tags: ['Widgets'],
      operations: { list: {} },
    });

    const ops = operationResource({
      path: 'widgets',
      operations: (op) => ({
        list: op.read({
          path: '',
          output: z.object({ ok: z.boolean() }),
          handler: () => ({ ok: true }),
        }),
      }),
    });

    expect(() =>
      validateRouteCollisions({
        generatedResources: [crud],
        manualResources: [],
        operationBundles: [ops],
      }),
    ).toThrow(/duplicate route/i);
  });
});

/**
 * The path slug is not injective — `{ key: 'run', path: 'a' }` and
 * `{ key: 'run_a' }` collapse to the same discriminator, as do paths
 * `a/b` and `a-b`. Those routes are distinct so the path check passes,
 * and the second OpenAPI component would silently overwrite the first.
 */
describe('operation id uniqueness', () => {
  it('rejects two operations whose discriminators collide', () => {
    const bundle = operationResource({
      path: 'jobs',
      operations: (op) => ({
        run: op.read({
          path: 'a',
          output: z.object({ value: z.string() }),
          handler: () => ({ value: 'a' }),
        }),
        run_a: op.read({
          output: z.object({ value: z.string() }),
          handler: () => ({ value: 'b' }),
        }),
      }),
    });

    expect(() =>
      validateRouteCollisions({
        generatedResources: [],
        manualResources: [],
        operationBundles: [bundle],
      }),
    ).toThrow(/operation id "OperationResource_jobs_get_run_a" is claimed by/);
  });

  it('rejects the same collision across two bundles', () => {
    const one = operationResource({
      path: 'same',
      operations: (op) => ({
        act: op.read({
          path: 'a/b',
          output: z.object({ v: z.string() }),
          handler: () => ({ v: '1' }),
        }),
      }),
    });
    const two = operationResource({
      path: 'same',
      operations: (op) => ({
        act: op.read({
          path: 'a-b',
          output: z.object({ v: z.string() }),
          handler: () => ({ v: '2' }),
        }),
      }),
    });

    expect(() =>
      validateRouteCollisions({
        generatedResources: [],
        manualResources: [],
        operationBundles: [one, two],
      }),
    ).toThrow(/operation id .* is claimed by/);
  });

  it('accepts distinct operations', () => {
    const bundle = operationResource({
      path: 'jobs',
      operations: (op) => ({
        start: op.read({
          output: z.object({ v: z.string() }),
          handler: () => ({ v: '1' }),
        }),
        stop: op.read({
          output: z.object({ v: z.string() }),
          handler: () => ({ v: '2' }),
        }),
      }),
    });

    expect(() =>
      validateRouteCollisions({
        generatedResources: [],
        manualResources: [],
        operationBundles: [bundle],
      }),
    ).not.toThrow();
  });
});

describe('generated OpenAPI component names', () => {
  const runResource = (path: string) =>
    operationResource({
      path,
      operations: (op) => ({
        run: op.read({
          output: z.object({ ok: z.boolean() }),
          handler: () => ({ ok: true }),
        }),
      }),
    });

  // Leo's repro: the id namer slugs punctuation to `_` while the
  // component namer pascal-cases, so these two get DISTINCT operation
  // ids and ONE component id. The path and id checks both pass and the
  // second schema silently overwrites the first in the generated document.
  it('rejects two resources whose component ids collide', () => {
    expect(() =>
      validateRouteCollisions({
        generatedResources: [],
        manualResources: [],
        operationBundles: [runResource('foo-bar'), runResource('fooBar')],
      }),
    ).toThrow(
      /OpenAPI component "FooBar_Get_RunOutput" is claimed by two different schemas/,
    );
  });

  // Same fold on the operation KEY: `run_a` and `runA` are valid, distinct
  // keys with distinct operation ids (`get_run_a` / `get_runA`), but both
  // pascal-case to `RunA`, so their input AND output components collide
  // across two resources on one base path.
  it('rejects two resources whose operation keys slugify to one component id', () => {
    const jobs = (key: 'run_a' | 'runA') =>
      operationResource({
        path: 'jobs',
        operations: (op) => ({
          [key]: op.write({
            input: z.object({ at: z.string() }),
            output: z.object({ ok: z.boolean() }),
            handler: () => ({ ok: true }),
          }),
        }),
      });

    expect(() =>
      validateRouteCollisions({
        generatedResources: [],
        manualResources: [],
        operationBundles: [jobs('run_a'), jobs('runA')],
      }),
    ).toThrow(
      /OpenAPI component "Jobs_Post_RunAInput" is claimed by two different schemas — operationResource\("jobs"\).run_a and operationResource\("jobs"\).runA/,
    );
  });

  // `output: z.array(...)` is the documented shape for a list endpoint.
  // An array output occupies a component exactly like an object one, so
  // the uniqueness check must see it too.
  it('rejects colliding ids for array outputs too', () => {
    const listResource = (path: string) =>
      operationResource({
        path,
        operations: (op) => ({
          run: op.read({
            output: z.array(z.object({ id: z.string() })),
            handler: () => [{ id: 'a' }],
          }),
        }),
      });

    expect(() =>
      validateRouteCollisions({
        generatedResources: [],
        manualResources: [],
        operationBundles: [listResource('foo-bar'), listResource('fooBar')],
      }),
    ).toThrow(/OpenAPI component "FooBar_Get_RunOutput" is claimed by/);
  });

  // One named schema reused across operations is one instance and one
  // component. Comparing ids instead of identity rejected it, which is a
  // worse failure than the collision being prevented: it refuses a
  // configuration that works.
  it('accepts one named schema reused across two operations', () => {
    const shared = withOpenApi(z.object({ id: z.string() }), 'SharedPetDto');
    const bundle = defineOperationResource({
      path: 'pets',
      public: true,
      operations: {
        featured: {
          key: 'featured',
          method: 'GET',
          path: 'featured',
          status: 200,
          output: shared,
          handler: () => ({ id: 'a' }),
        },
        mascot: {
          key: 'mascot',
          method: 'GET',
          path: 'mascot',
          status: 200,
          output: shared,
          handler: () => ({ id: 'b' }),
        },
      },
    });

    expect(() =>
      validateRouteCollisions({
        generatedResources: [],
        manualResources: [],
        operationBundles: [bundle],
      }),
    ).not.toThrow();
  });

  it('accepts resources whose names differ by more than punctuation', () => {
    expect(() =>
      validateRouteCollisions({
        generatedResources: [],
        manualResources: [],
        operationBundles: [runResource('foo-bar'), runResource('baz')],
      }),
    ).not.toThrow();
  });
});
// The early-return this pins the removal of: an operation-FREE app with
// two CRUD bundles on one route booted clean, and the collision only
// surfaced when an unrelated operation resource joined the app later.
describe('CRUD-vs-CRUD collisions with zero operation bundles', () => {
  it('throws without any operation resource present', () => {
    class ThingEntity {
      id!: string;
    }
    const crud = (key: string) =>
      defineResource({
        key,
        entity: ThingEntity,
        path: 'things',
        operations: [Operation.List],
      });

    expect(() =>
      validateRouteCollisions({
        generatedResources: [crud('thing-a'), crud('thing-b')],
        manualResources: [],
        operationBundles: [],
      }),
    ).toThrow(/duplicate route|overlapping/i);
  });
});
// A forwardRef whose factory THROWS (the TDZ circular-import case) made
// its module invisible; a handler it might export was silently
// auto-registered as a duplicate. Refusal must be loud and ownership
// explicit.
describe('uninspectable forwardRef imports', () => {
  const throwingRef = {
    forwardRef: () => {
      throw new ReferenceError('TDZ');
    },
  };

  it('refuses to auto-register a handler next to an uninspectable forwardRef', () => {
    class CycleHandler {
      handle() {
        return { ok: true };
      }
    }
    expect(() =>
      defineOperationResource({
        path: 'cycle-probe',
        public: true,
        imports: [throwingRef as never],
        operations: {
          read: {
            key: 'read',
            method: 'GET',
            path: '',
            status: 200,
            output: false,
            handler: CycleHandler,
          },
        },
      }),
    ).toThrow(/cannot be\s+inspected at definition time/);
  });

  // One frame down: the throwing ref inside a module's EXPORTS — the
  // circular re-export idiom — was still swallowed after the top-level
  // fix. Same defect, sibling frame.
  it('refuses when the throwing forwardRef hides inside a re-export', () => {
    class CycleHandler {
      handle() {
        return { ok: true };
      }
    }
    @Module({ exports: [throwingRef as never] })
    class WrapperModule {}

    expect(() =>
      defineOperationResource({
        path: 'cycle-nested-probe',
        public: true,
        imports: [WrapperModule],
        operations: {
          read: {
            key: 'read',
            method: 'GET',
            path: '',
            status: 200,
            output: false,
            handler: CycleHandler,
          },
        },
      }),
    ).toThrow(/cannot be\s+inspected at definition time/);
  });

  it('accepts the same shape when the handler is explicitly provided', () => {
    class CycleHandler {
      handle() {
        return { ok: true };
      }
    }
    expect(() =>
      defineOperationResource({
        path: 'cycle-probe-ok',
        public: true,
        imports: [throwingRef as never],
        providers: [CycleHandler],
        operations: {
          read: {
            key: 'read',
            method: 'GET',
            path: '',
            status: 200,
            output: false,
            handler: CycleHandler,
          },
        },
      }),
    ).not.toThrow();
  });
});
