import type { MessageEvent } from '@nestjs/common';
import { withOpenApi } from '@concepta/nestjs-core';
import type { Observable } from 'rxjs';
import { z } from 'zod';
import { withHiddenFieldsRemoved } from './zod-projections';

import type {
  CompiledOperationDescriptor,
  OperationHandlerRef,
  OperationHttpMethod,
  OperationResource,
  OperationResourceDefinition,
} from '../domain/interfaces/operation-resource.interface';
import { defineOperationResource } from '../infrastructure/resource/define-operation-resource';
import { assertValidOperationKey } from '../infrastructure/resource/operation-resource/operation-key';
import { operationBodySchema } from '../infrastructure/resource/operation-resource/operation-body-schema';
import { operationDtoBaseName } from '../infrastructure/resource/operation-resource/build-operation-controller';
import { assertFailClosedResponse } from '../common/utils/open-api-schema.util';
import type {
  OperationAclConfig,
  ResourceAclConfig,
} from '../domain/interfaces/resource-acl.interface';

type InferIn<TInput> = [TInput] extends [z.ZodObject]
  ? z.output<TInput>
  : unknown;

type InferOut<TOutput> = [TOutput] extends [false]
  ? void
  : [TOutput] extends [z.ZodType]
  ? z.output<TOutput>
  : unknown;

type OperationOutputSchema = z.ZodObject | z.ZodArray;
type OperationOutputConfig = OperationOutputSchema | false;

/**
 * Extract `:param` names from a path template into a string-record type.
 * Decision (#50): keys map to path segments verbatim (no kebab-case).
 */
export type PathParams<S extends string> = string extends S
  ? Record<string, string>
  : S extends `${string}:${infer Param}/${infer Rest}`
  ? { [K in Param | keyof PathParams<`/${Rest}`>]: string }
  : S extends `${string}:${infer Param}`
  ? { [K in Param]: string }
  : {};

type MergeParams<A, B> = Omit<A, keyof B> & B;

type ParamsFromSchema<TParamsSchema extends z.ZodObject | undefined> = [
  TParamsSchema,
] extends [z.ZodObject]
  ? z.output<TParamsSchema>
  : {};

type EffectiveParams<
  TBase extends string,
  TOpPath extends string,
  TParamsSchema extends z.ZodObject | undefined,
> = MergeParams<
  PathParams<TBase>,
  MergeParams<PathParams<TOpPath>, ParamsFromSchema<TParamsSchema>>
>;

type ReadMethod = 'GET';
type WriteMethod = 'POST' | 'PUT' | 'PATCH';
type DeleteMethod = 'DELETE';

interface SharedBuilderFields<
  TInput extends z.ZodObject | undefined,
  TOutput extends OperationOutputConfig,
  TParams extends object,
> {
  readonly status?: number;
  readonly summary?: string;
  readonly public?: boolean;
  /**
   * Access control for this route. `op.read` and `op.delete` infer
   * `read` / `delete`; `op.write` has no inferable action and must
   * declare one (or `false`). Requires resource-level `acl`.
   */
  readonly acl?: OperationAclConfig;
  readonly transactional?: boolean;
  /**
   * Milliseconds before `ctx.signal` aborts and the response resolves
   * `504 Gateway Timeout` (issue #78). Absent means no deadline.
   */
  readonly deadlineMs?: number;
  readonly input?: TInput;
  /** Required: schema to whitelist, or `false` to opt out explicitly. */
  readonly output: TOutput;
  readonly handler: OperationHandlerRef<
    InferIn<TInput>,
    InferOut<TOutput>,
    TParams
  >;
  readonly decorators?: readonly MethodDecorator[];
}

export type ReadBuilderConfig<
  TInput extends z.ZodObject | undefined = undefined,
  TOutput extends OperationOutputConfig = OperationOutputSchema,
  TParams extends object = object,
  TOpPath extends string = '',
> = SharedBuilderFields<TInput, TOutput, TParams> & {
  readonly method?: ReadMethod;
  readonly path?: TOpPath;
};

export type WriteBuilderConfig<
  TInput extends z.ZodObject | undefined = undefined,
  TOutput extends OperationOutputConfig = OperationOutputSchema,
  TParams extends object = object,
  TOpPath extends string = '',
> = SharedBuilderFields<TInput, TOutput, TParams> & {
  readonly method?: WriteMethod;
  readonly path?: TOpPath;
};

export type DeleteBuilderConfig<
  TInput extends z.ZodObject | undefined = undefined,
  TOutput extends OperationOutputConfig = OperationOutputSchema,
  TParams extends object = object,
  TOpPath extends string = '',
> = SharedBuilderFields<TInput, TOutput, TParams> & {
  readonly method?: DeleteMethod;
  readonly path?: TOpPath;
};

export type PendingBuilder = 'read' | 'write' | 'delete' | 'sse';

/**
 * `op.sse()` config (issue #52). No `output` — the response body IS the
 * event stream, never a whitelisted JSON value — and no `transactional`,
 * since holding a database transaction open across a connection that may
 * never complete is not something core should make easy to reach for.
 * `handler` returns an `Observable<MessageEvent>`; Nest owns writing each
 * emitted event to the connection as it arrives.
 */
export interface SseBuilderConfig<
  TInput extends z.ZodObject | undefined = undefined,
  TParams extends object = object,
  TOpPath extends string = '',
> {
  readonly path?: TOpPath;
  readonly summary?: string;
  readonly public?: boolean;
  /**
   * Access control for this route. Always method `GET`, so — like
   * `op.read` — the inferred default action is `read`.
   */
  readonly acl?: OperationAclConfig;
  readonly input?: TInput;
  readonly handler: OperationHandlerRef<
    InferIn<TInput>,
    Observable<MessageEvent>,
    TParams
  >;
  readonly decorators?: readonly MethodDecorator[];
}

/**
 * Pending operation produced by `op.read` / `op.write` / `op.delete`.
 * Generics are preserved so `typeof resource.authored` stays informative.
 */
export interface PendingOperation<
  TInput = unknown,
  TOutput = unknown,
  TParams extends object = object,
> {
  readonly builder: PendingBuilder;
  readonly method: OperationHttpMethod;
  readonly path: string | undefined;
  readonly status: number | undefined;
  readonly summary: string | undefined;
  readonly public: boolean | undefined;
  readonly acl: OperationAclConfig | undefined;
  readonly transactional: boolean | undefined;
  readonly deadlineMs: number | undefined;
  readonly input: z.ZodObject | undefined;
  readonly output: OperationOutputConfig;
  readonly handler: OperationHandlerRef<TInput, TOutput, TParams>;
  readonly decorators: readonly MethodDecorator[] | undefined;
}

/**
 * Heterogeneous operation map. Per-op generics live on each
 * {@link PendingOperation} value and on `authored`; the index signature uses
 * an opaque `handler` so variance does not collapse the callback return type.
 */
export type OperationRecord = {
  readonly [key: string]: {
    readonly builder: PendingBuilder;
    readonly method: OperationHttpMethod;
    readonly path: string | undefined;
    readonly status: number | undefined;
    readonly summary: string | undefined;
    readonly public: boolean | undefined;
    readonly acl: OperationAclConfig | undefined;
    readonly transactional: boolean | undefined;
    readonly deadlineMs: number | undefined;
    readonly input: z.ZodObject | undefined;
    readonly output: OperationOutputConfig;
    readonly handler: unknown;
    readonly decorators: readonly MethodDecorator[] | undefined;
  };
};

export interface BoundBuilders<
  TBase extends string,
  TParamsSchema extends z.ZodObject | undefined = undefined,
> {
  read<
    TInput extends z.ZodObject | undefined = undefined,
    TOutput extends OperationOutputConfig = OperationOutputSchema,
    const TOpPath extends string = '',
  >(
    config: ReadBuilderConfig<
      TInput,
      TOutput,
      EffectiveParams<TBase, TOpPath, TParamsSchema>,
      TOpPath
    >,
  ): PendingOperation<
    InferIn<TInput>,
    InferOut<TOutput>,
    EffectiveParams<TBase, TOpPath, TParamsSchema>
  >;

  write<
    TInput extends z.ZodObject | undefined = undefined,
    TOutput extends OperationOutputConfig = OperationOutputSchema,
    const TOpPath extends string = '',
  >(
    config: WriteBuilderConfig<
      TInput,
      TOutput,
      EffectiveParams<TBase, TOpPath, TParamsSchema>,
      TOpPath
    >,
  ): PendingOperation<
    InferIn<TInput>,
    InferOut<TOutput>,
    EffectiveParams<TBase, TOpPath, TParamsSchema>
  >;

  delete<
    TInput extends z.ZodObject | undefined = undefined,
    TOutput extends OperationOutputConfig = OperationOutputSchema,
    const TOpPath extends string = '',
  >(
    config: DeleteBuilderConfig<
      TInput,
      TOutput,
      EffectiveParams<TBase, TOpPath, TParamsSchema>,
      TOpPath
    >,
  ): PendingOperation<
    InferIn<TInput>,
    InferOut<TOutput>,
    EffectiveParams<TBase, TOpPath, TParamsSchema>
  >;

  sse<
    TInput extends z.ZodObject | undefined = undefined,
    const TOpPath extends string = '',
  >(
    config: SseBuilderConfig<
      TInput,
      EffectiveParams<TBase, TOpPath, TParamsSchema>,
      TOpPath
    >,
  ): PendingOperation<
    InferIn<TInput>,
    Observable<MessageEvent>,
    EffectiveParams<TBase, TOpPath, TParamsSchema>
  >;
}

export interface OperationResourceInput<
  TBase extends string,
  TOps extends OperationRecord,
  TParamsSchema extends z.ZodObject | undefined = undefined,
> {
  readonly path: TBase;
  readonly tags?: readonly string[];
  readonly public?: boolean;
  /**
   * Access control for the generated controller. Required before any
   * operation may declare an `acl` action.
   */
  readonly acl?: ResourceAclConfig;
  /**
   * Optional zod object for path params. Keys must be `:params` present on
   * `path`. Validated at request time (400). Improves `ctx.params` typing
   * when the schema output is narrower than `string`.
   */
  readonly params?: TParamsSchema;
  /**
   * Callback form only — builders must see the base path so `ctx.params`
   * can be typed from `:segments`. Split-file composition: export
   * `(op) => op.write({...})` factories and spread them into the record.
   */
  readonly operations: (op: BoundBuilders<TBase, TParamsSchema>) => TOps;
  readonly imports?: OperationResourceDefinition['imports'];
  readonly providers?: OperationResourceDefinition['providers'];
  readonly exports?: OperationResourceDefinition['exports'];
  readonly decorators?: OperationResourceDefinition['decorators'];
}

/**
 * Zod authoring result: planner-compatible {@link OperationResource} plus the
 * typed authored operation record (for ClientOf / inference consumers).
 */
export type ZodOperationResource<TOps extends OperationRecord> =
  OperationResource & {
    readonly authored: TOps;
  };

/** Runtime extract of `:param` names from a path template. */
export function extractPathParamNames(path: string): string[] {
  const names: string[] = [];
  const re = /:([A-Za-z_][A-Za-z0-9_]*)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(path)) !== null) {
    const name = match[1];
    if (name !== undefined && !names.includes(name)) {
      names.push(name);
    }
  }
  return names;
}

function assertParamsSchemaMatchesPath(
  resourcePath: string,
  paramsSchema: z.ZodObject,
): void {
  const pathKeys = new Set(extractPathParamNames(resourcePath));
  for (const key of Object.keys(paramsSchema.shape)) {
    if (!pathKeys.has(key)) {
      throw new Error(
        `operationResource "${resourcePath}": params.${key} is not a :param ` +
          `on path "${resourcePath}"`,
      );
    }
  }
}

function defaultMethod(
  builder: PendingBuilder,
  configured: OperationHttpMethod | undefined,
): OperationHttpMethod {
  if (configured !== undefined) {
    return configured;
  }
  // `sse` is listed EXPLICITLY, not left to fall through. Without this
  // case an SSE operation reaching `defaultMethod` with no configured
  // method silently defaulted to `POST` — a method no `EventSource` can
  // issue, and one the generated controller now rejects outright. The
  // GET-only invariant used to survive only because `toPendingSse`
  // happened to hardcode `'GET'` at its single call site.
  if (builder === 'read' || builder === 'sse') {
    return 'GET';
  }
  if (builder === 'delete') {
    return 'DELETE';
  }
  return 'POST';
}

function defaultStatus(configured: number | undefined): number {
  return configured ?? 200;
}

/**
 * The response schema as a NAMED component. An array output occupies a
 * component exactly like an object one, so both get the id — and both
 * must strip undeclared keys, since serialization is validation.
 */
function compileOperationOutput(
  schema: OperationOutputSchema,
  name: string,
): z.ZodType {
  // `dto: { response: false }` holds here too: an operation output built
  // from an entity schema strips its hidden columns like every other
  // response path (computed fields, JSON columns, exposed relations).
  const named = withOpenApi(
    withHiddenFieldsRemoved(schema, `operationResource output "${name}"`),
    name,
  );
  assertFailClosedResponse(named, `operationResource output "${name}"`);
  return named;
}

/**
 * The request schema: a body (POST/PUT/PATCH) is a named component behind
 * the payload-shape guard; a query (GET/DELETE) stays UNNAMED so the
 * document expands it into one query parameter per property instead of a
 * `$ref` no query parameter can carry.
 */
function compileOperationInput(
  schema: z.ZodObject,
  method: OperationHttpMethod,
  name: string,
): z.ZodType {
  if (method === 'GET' || method === 'DELETE') {
    return withOpenApi(schema);
  }
  return withOpenApi(operationBodySchema(schema), name);
}

function assertOperationHandler(
  handler: unknown,
  resourcePath: string,
  key: string,
): asserts handler is CompiledOperationDescriptor['handler'] {
  if (typeof handler === 'function') return;

  // `{ useClass }` is part of `OperationHandlerRef` and is the documented
  // way to hand over a class whose `handle` is an instance field (which
  // no runtime check can tell apart from a plain function). Rejecting
  // every object here made the documented form compile and then throw.
  if (
    typeof handler === 'object' &&
    handler !== null &&
    'useClass' in handler &&
    typeof (handler as { useClass: unknown }).useClass === 'function'
  ) {
    return;
  }

  throw new Error(
    `operationResource "${resourcePath}": operation "${key}" handler must be ` +
      `a function, an injectable class, or { useClass: Handler }`,
  );
}

function compileOperation(
  key: string,
  pending: OperationRecord[string],
  resourcePath: string,
): CompiledOperationDescriptor {
  const method = defaultMethod(pending.builder, pending.method);
  const status = defaultStatus(pending.status);
  // path=key by default; explicit `path: ''` keeps a root mount (?? not ||).
  const path = pending.path ?? key;

  // two bundles on one base path can declare the same method+key with
  // different explicit paths, and without it both DTOs would claim one
  // OpenAPI component name.

  // One canonical namer, shared with the planner's uniqueness check, so
  // component names cannot drift from the ids that are validated.
  const dtoBaseName = operationDtoBaseName({
    resourcePath,
    method,
    key,
    path,
  });

  const inputSchema =
    pending.input === undefined
      ? undefined
      : compileOperationInput(pending.input, method, `${dtoBaseName}Input`);

  const output =
    pending.output === false
      ? false
      : compileOperationOutput(pending.output, `${dtoBaseName}Output`);

  if (status === 204 && output !== false) {
    throw new Error(
      `operationResource "${resourcePath}": operation "${key}" sets status 204 ` +
        `with an output schema — 204 responses have no body. Use output: false ` +
        `or a non-204 status.`,
    );
  }

  assertOperationHandler(pending.handler, resourcePath, key);

  return {
    key,
    method,
    path,
    status,
    summary: pending.summary,
    public: pending.public,
    acl: pending.acl,
    transactional: pending.transactional,
    deadlineMs: pending.deadlineMs,
    inputSchema,
    output,
    handler: pending.handler,
    decorators: pending.decorators,
    responseMode: pending.builder === 'sse' ? 'sse' : undefined,
  };
}

function toPendingRead<
  TInput extends z.ZodObject | undefined,
  TOutput extends OperationOutputConfig,
  TParams extends object,
  TOpPath extends string,
>(
  config: ReadBuilderConfig<TInput, TOutput, TParams, TOpPath>,
): PendingOperation<InferIn<TInput>, InferOut<TOutput>, TParams> {
  return {
    builder: 'read',
    method: defaultMethod('read', config.method),
    path: config.path,
    status: config.status,
    summary: config.summary,
    public: config.public,
    acl: config.acl,
    transactional: config.transactional,
    deadlineMs: config.deadlineMs,
    input: config.input,
    output: config.output,
    handler: config.handler,
    decorators: config.decorators,
  };
}

function toPendingWrite<
  TInput extends z.ZodObject | undefined,
  TOutput extends OperationOutputConfig,
  TParams extends object,
  TOpPath extends string,
>(
  config: WriteBuilderConfig<TInput, TOutput, TParams, TOpPath>,
): PendingOperation<InferIn<TInput>, InferOut<TOutput>, TParams> {
  return {
    builder: 'write',
    method: defaultMethod('write', config.method),
    path: config.path,
    status: config.status,
    summary: config.summary,
    public: config.public,
    acl: config.acl,
    transactional: config.transactional,
    deadlineMs: config.deadlineMs,
    input: config.input,
    output: config.output,
    handler: config.handler,
    decorators: config.decorators,
  };
}

function toPendingDelete<
  TInput extends z.ZodObject | undefined,
  TOutput extends OperationOutputConfig,
  TParams extends object,
  TOpPath extends string,
>(
  config: DeleteBuilderConfig<TInput, TOutput, TParams, TOpPath>,
): PendingOperation<InferIn<TInput>, InferOut<TOutput>, TParams> {
  return {
    builder: 'delete',
    method: defaultMethod('delete', config.method),
    path: config.path,
    status: config.status,
    summary: config.summary,
    public: config.public,
    acl: config.acl,
    transactional: config.transactional,
    deadlineMs: config.deadlineMs,
    input: config.input,
    output: config.output,
    handler: config.handler,
    decorators: config.decorators,
  };
}

function toPendingSse<
  TInput extends z.ZodObject | undefined,
  TParams extends object,
  TOpPath extends string,
>(
  config: SseBuilderConfig<TInput, TParams, TOpPath>,
): PendingOperation<InferIn<TInput>, Observable<MessageEvent>, TParams> {
  return {
    builder: 'sse',
    // Through `defaultMethod`, not a literal: one place decides an SSE
    // operation's method, and `assertSseRouteShape` in the generated
    // controller enforces the same invariant on the FINAL registered
    // metadata regardless of which authoring path produced the pending.
    method: defaultMethod('sse', undefined),
    path: config.path,
    status: undefined,
    summary: config.summary,
    public: config.public,
    acl: config.acl,
    transactional: undefined,
    // Always absent, and `SseBuilderConfig` deliberately exposes no
    // `deadlineMs` to set it: the handler returns its Observable
    // immediately, so a deadline would fire against the setup call rather
    // than the stream, and a long-lived SSE connection is exactly what a
    // request deadline must not cut. Bound the stream itself instead.
    deadlineMs: undefined,
    input: config.input,
    output: false,
    handler: config.handler,
    decorators: config.decorators,
  };
}

function createBoundBuilders<
  TBase extends string,
  TParamsSchema extends z.ZodObject | undefined,
>(): BoundBuilders<TBase, TParamsSchema> {
  return {
    read: toPendingRead,
    write: toPendingWrite,
    delete: toPendingDelete,
    sse: toPendingSse,
  };
}

/**
 * Zod-first sibling of {@link defineResource} for typed non-CRUD endpoints
 * (issue #43 / #50 authoring surface).
 *
 * - `operations` is a callback so base-path params type `ctx.params`.
 * - Builders: `read` (GET), `write` (POST/PUT/PATCH), `delete` (DELETE).
 * - `output` is required (`schema` or `false`) so responses cannot silently leak.
 * - Operation path defaults to its key (verbatim). Use `path: ''` for a
 *   root-mounted route on the resource path.
 */
export function operationResource<
  const TBase extends string,
  TOps extends OperationRecord,
  TParamsSchema extends z.ZodObject | undefined = undefined,
>(
  input: OperationResourceInput<TBase, TOps, TParamsSchema>,
): ZodOperationResource<TOps> {
  const builders = createBoundBuilders<TBase, TParamsSchema>();
  const authored = input.operations(builders);

  let paramsSchema: z.ZodObject | undefined;
  if (input.params !== undefined) {
    const params: z.ZodObject = input.params;
    assertParamsSchemaMatchesPath(input.path, params);
    // Bridged, never named: path params are documented one by one.
    paramsSchema = withOpenApi(params);
  }

  const operations: Record<string, CompiledOperationDescriptor> = {};
  for (const [key, pending] of Object.entries(authored)) {
    assertValidOperationKey(key, input.path);
    operations[key] = compileOperation(key, pending, input.path);
  }

  const resource = defineOperationResource({
    path: input.path,
    tags: input.tags,
    public: input.public,
    acl: input.acl,
    paramsSchema,
    operations,
    imports: input.imports,
    providers: input.providers,
    exports: input.exports,
    decorators: input.decorators,
  });

  const result: ZodOperationResource<TOps> = {
    ...resource,
    authored,
  };
  return result;
}
