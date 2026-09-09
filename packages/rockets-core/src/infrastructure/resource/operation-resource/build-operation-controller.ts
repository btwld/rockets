/* eslint-disable no-restricted-syntax --
 * Generated Nest controller for operationResource (issue #43). Core owns the
 * declarative resource compiler; the emitted @Controller is the Nest adapter
 * for that declaration, not an app-owned HTTP gateway. See CONFIGURATION.md §6a.
 * Scoped disable keeps no-restricted-imports (cycle guard) active for this file.
 */
/* eslint-disable @darraghor/nestjs-typed/controllers-should-supply-api-tags --
 * ApiTags is applied immediately below from definition.tags (with a default).
 */
import {
  AccessControlGrant,
  AccessControlQuery,
} from '@concepta/nestjs-access-control';
import { inspect } from 'node:util';
import {
  applyDecorators,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  InternalServerErrorException,
  Logger,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  RequestMethod,
  Res,
  Sse,
  StandardSchemaValidationPipe,
  Type,
  UsePipes,
} from '@nestjs/common';
import {
  METHOD_METADATA,
  PARAMTYPES_METADATA,
  PATH_METADATA,
  SSE_METADATA,
} from '@nestjs/common/constants';
import { RuntimeException } from '@concepta/nestjs-core';
import { ContextIdFactory, ModuleRef } from '@nestjs/core';
import { Transactional, isTransactional } from '@concepta/nestjs-repository';
import { catchError, isObservable, throwError, type Observable } from 'rxjs';
import { AuthPublic } from '@concepta/nestjs-authentication';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { z } from 'zod';

import { AuthUser } from '../../../common/auth/auth-user.decorator';
import type { AuthorizedUser } from '../../../domain/interfaces/auth-user.interface';
import type {
  CompiledOperationDescriptor,
  OperationContext,
  OperationHandlerFn,
  OperationHttpMethod,
  OperationRequest,
  OperationResourceDefinition,
} from '../../../domain/interfaces/operation-resource.interface';
import { rocketsSchemaValidation } from '../../../common/utils/standard-schema.util';
import {
  assertNamedSchema,
  isOpenApiBridged,
} from '../../../common/utils/open-api-schema.util';
import {
  ERROR_MESSAGE_FALLBACK,
  unwrapToClientRuntimeException,
  unwrapToHttpException,
} from '../../filters/exceptions.filter';
import { getHandlerClass, isHandlerFunction } from './is-handler-class';

const logger = new Logger('OperationResource');
const SWAGGER_API_SECURITY_METADATA = 'swagger/apiSecurity';

/** Structural view of the native request — avoids coupling core to Express. */
interface NativeRequest {
  readonly headers?: Readonly<Record<string, string | string[] | undefined>>;
}

const METHOD_DECORATOR: Record<
  OperationHttpMethod,
  (path?: string | string[]) => MethodDecorator
> = {
  GET: Get,
  POST: Post,
  PUT: Put,
  PATCH: Patch,
  DELETE: Delete,
};

function outputValidationError(
  label: string,
  detail: unknown,
): InternalServerErrorException {
  logger.error(
    `Operation "${label}" returned a value that failed output validation`,
    detail === undefined ? undefined : JSON.stringify(detail),
  );
  return new InternalServerErrorException({
    statusCode: 500,
    message: 'Operation handler returned a value that failed output validation',
    error: 'Internal Server Error',
  });
}

/**
 * Every schema an operation carries must be able to validate AND
 * document: a body or response schema is a NAMED component, a query or
 * params schema is bridged (documented one parameter per property).
 * Definition-time, so a schema that was extended after `withOpenApi()`
 * fails the resource, not the first request.
 */
function assertOperationSchemas(
  definition: OperationResourceDefinition,
  operation: CompiledOperationDescriptor,
): void {
  const label = `operationResource "${definition.path}" op "${operation.key}"`;
  if (operation.inputSchema !== undefined) {
    if (operation.method === 'GET' || operation.method === 'DELETE') {
      assertBridged(operation.inputSchema, `${label} input (query)`);
    } else {
      assertNamedSchema(operation.inputSchema, `${label} input`);
    }
  }
  if (operation.output !== false) {
    assertNamedSchema(operation.output, `${label} output`);
  }
  if (definition.paramsSchema !== undefined) {
    assertBridged(
      definition.paramsSchema,
      `operationResource "${definition.path}" params`,
    );
  }
}

function assertBridged(schema: z.ZodType, context: string): void {
  if (!isOpenApiBridged(schema)) {
    throw new Error(
      `${context}: schema has no OpenAPI bridge — wrap it LAST with ` +
        `withOpenApi(schema).`,
    );
  }
}

/**
 * Validate handler output against the declared schema. Failures are
 * server bugs → 500, never 400 (clients did not send the response body).
 * The failing issues are logged server-side; the client response stays
 * generic. Inline rather than Nest's serializer interceptor on purpose:
 * that one passes `null` / `undefined` through and maps arrays per item,
 * while this contract is "the declared shape, or a loud 500".
 */
async function applyOutputSchema(
  schema: z.ZodType,
  value: unknown,
  label: string,
): Promise<unknown> {
  if (value === null || value === undefined) {
    throw outputValidationError(label, `handler returned ${String(value)}`);
  }
  const result = await schema['~standard'].validate(value);
  if (result.issues !== undefined) {
    throw outputValidationError(label, result.issues);
  }
  return result.value;
}

/**
 * Wrap an SSE handler's stream so a MID-STREAM failure is masked the
 * same way {@link RocketsCoreExceptionsFilter} masks a 5xx JSON body.
 *
 * SSE errors never reach that filter — that is the root cause, not an
 * oversight. Once the first event is written the headers are committed,
 * so Nest's own SSE response controller can no longer turn a failure
 * into a status code; it writes `{ type: 'error', data: err.message }`
 * straight onto the open connection (see `router-response-controller`'s
 * `catchError`, which rethrows only while `!stream.headersCommitted`).
 * The raw message of whatever the handler threw — a driver error naming
 * a host, a connection string, an internal id — therefore reached the
 * client, and `public: true` SSE is a first-class documented pattern, so
 * that client can be anonymous.
 *
 * Masking happens in the handler, BEFORE Nest sees the error, so it
 * covers both sides of that commit boundary: pre-commit the replacement
 * is still an `HttpException` and the filter renders it with the right
 * status; post-commit its `.message` is what lands on the wire.
 */
function maskSseStreamErrors(
  result: unknown,
  label: string,
): Observable<unknown> {
  if (!isObservable(result)) {
    // Nest would reject this too (`assertObservable`), but with a bare
    // `ReferenceError` after the route has already been entered. Failing
    // here keeps it a normal 500 through the exceptions filter.
    throw outputValidationError(
      label,
      'SSE handler did not return an Observable',
    );
  }
  return result.pipe(
    catchError((error: unknown) =>
      throwError(() => toClientSafeStreamError(error, label)),
    ),
  );
}

/**
 * The SAME safe/unsafe decision {@link RocketsCoreExceptionsFilter}
 * makes, over the SAME unwrapped exception.
 *
 * Unwrapping first is not a detail — it is the difference between a
 * `403` and a `500`. The repository/CRUD layers wrap a hook's
 * `HttpException` as a `RepositoryQueryException`, which extends
 * `RuntimeException` and carries NO `httpStatus`; judged at the top
 * level it looks like an unclassified 5xx and gets masked. The filter
 * never judges it at the top level — it walks `context.originalError`
 * first — so this path calls the filter's own exported chain walkers
 * rather than re-deriving them.
 *
 * What is returned is the UNWRAPPED exception wherever possible, not a
 * rebuilt one. Both sides of the header-commit boundary then agree:
 * before the first event the error still reaches the filter, which
 * resolves the identical status/`errorCode` it would have resolved from
 * the wrapper; after it, Nest writes that same exception's `.message`.
 * A rebuilt exception is used ONLY where the two cannot agree — a
 * `safeMessage` that deliberately differs from the internal `.message`,
 * and the 5xx mask itself.
 *
 * (The one thing a wrapper carries that this drops: `details` attached
 * to the WRAPPER rather than to the unwrapped error. The filter drops
 * `details` at 5xx anyway, and validation `400`s attach them to the
 * exception that is actually thrown.)
 */
function toClientSafeStreamError(error: unknown, label: string): unknown {
  const unwrapped: unknown =
    unwrapToHttpException(error) ??
    unwrapToClientRuntimeException(error) ??
    error;

  // `RuntimeException` extends `HttpException` upstream — checked first,
  // or its `safeMessage` masking below would never run and a 5xx domain
  // exception would write its internal `.message` to the stream.
  if (unwrapped instanceof RuntimeException) {
    const status = unwrapped.httpStatus ?? 500;
    if (status < 500) {
      // `safeMessage` is the author's opt-in client-visible text. Only
      // when it deliberately differs from `.message` must the exception
      // be rebuilt — otherwise the original travels, keeping its
      // `errorCode` and any attached `details` for the pre-commit path.
      return unwrapped.safeMessage &&
        unwrapped.safeMessage !== unwrapped.message
        ? new HttpException(unwrapped.safeMessage, status)
        : unwrapped;
    }
    logStreamFailure(label, error);
    return new HttpException(
      unwrapped.safeMessage ?? ERROR_MESSAGE_FALLBACK,
      status,
    );
  }

  if (unwrapped instanceof HttpException) {
    // An HttpException body is author-chosen and the filter puts it on
    // the wire at any status — including 5xx, where it is still logged.
    if (unwrapped.getStatus() >= 500) {
      logStreamFailure(label, error);
    }
    return unwrapped;
  }

  // A plain `Error`, a driver failure: a 500 with no declared safe text.
  logStreamFailure(label, error);
  return new InternalServerErrorException(ERROR_MESSAGE_FALLBACK);
}

function logStreamFailure(label: string, error: unknown): void {
  // Same channel and same reasoning as the filter's 'Unhandled 5xx':
  // through Nest's Logger, at every 5xx, with `inspect` so a stack-less
  // non-Error does not log as '[object Object]'.
  logger.error(
    `SSE operation "${label}" stream errored`,
    error instanceof Error ? error.stack ?? error.message : inspect(error),
  );
}

function controllerClassName(path: string): string {
  const slug = path.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
  return `OperationResource_${slug || 'root'}`;
}

/**
 * Stable, globally unique identifier for one generated route.
 *
 * `controllerName + method + key` is NOT unique for configurations the
 * planner accepts: two bundles on the same base path can each declare a
 * `GET` operation keyed `action` with different explicit `path`s
 * (`one` / `two`). Both routes are legal and distinct, but they produced
 * the same operation ID and the same generated DTO names, so Swagger
 * pointed both at one component and the second schema overwrote the
 * first.
 *
 * The operation's own path is the discriminator that makes it unique —
 * the planner already rejects duplicate `METHOD + full path`. It is
 * appended only when it differs from the key, so the common case
 * (`path` defaulting to `key`) keeps its short, readable name.
 */
function operationId(
  controllerName: string,
  operation: CompiledOperationDescriptor,
): string {
  return `${controllerName}_${operation.method.toLowerCase()}_${operationDiscriminator(
    operation.key,
    operation.path,
  )}`;
}

/**
 * `key`, or `key_path-slug` when an explicit path makes two operations
 * with the same key distinct. Shared with the zod DTO namer so IDs and
 * component names stay in step.
 */
export function operationDiscriminator(key: string, path: string): string {
  const pathSlug = path.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
  if (pathSlug === '' || pathSlug === key) return key;
  return `${key}_${pathSlug}`;
}

/**
 * Base name for an operation's generated request/response DTO classes,
 * which become OpenAPI component names.
 *
 * Shared with the planner so the uniqueness assertion checks the SAME
 * string the zod compiler stamps. Two namers drifting apart is what let
 * `foo-bar` and `fooBar` get distinct operation ids and one component
 * name: the ids keyed off an underscore slug, the DTOs off a pascal
 * transform that folds both spellings together.
 *
 * `pascal` stays lossy on purpose. Making it injective would be a guess
 * about which characters matter; asserting the result is unique is
 * total. Same reasoning as `validateOperationIdUniqueness` — the
 * transform is a readability optimisation, never the thing correctness
 * rests on.
 */
export function operationDtoBaseName(args: {
  readonly resourcePath: string;
  readonly method: string;
  readonly key: string;
  readonly path: string;
}): string {
  return `${pascalSegment(args.resourcePath)}_${pascalSegment(
    args.method.toLowerCase(),
  )}_${pascalSegment(operationDiscriminator(args.key, args.path))}`;
}

function pascalSegment(value: string): string {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

/**
 * Generate a Nest controller class from an operation-resource definition.
 *
 * Note: Nest method decorators write metadata onto the property descriptor
 * returned by `Object.getOwnPropertyDescriptor`. Descriptor write-back into
 * the prototype is intentional for generated controllers (same pattern as
 * Nest's own decorator application).
 */
export function buildOperationController(
  definition: OperationResourceDefinition,
  /**
   * Local alias token per handler class this module does NOT register
   * itself (i.e. one supplied by an imported module).
   *
   * Every resolve stays `strict`. The alias is a local
   * `{ provide: alias, useExisting: HandlerClass }`, so `useExisting`
   * walks normal DI — imports honoured — while the token the route asks
   * for belongs to this module alone.
   *
   * A non-strict resolve is NOT an alternative: Nest's
   * `instanceLinksHost` returns `links[links.length - 1]` when given no
   * module id, i.e. the last module scanned app-wide with no relation to
   * the import graph. With one handler class exported by two modules,
   * both operation resources would silently share one instance.
   */
  handlerAliases: ReadonlyMap<unknown, symbol> = new Map(),
  aclDecorators: Readonly<Record<string, readonly MethodDecorator[]>> = {},
): Type<unknown> {
  if (definition.public === true) {
    for (const operation of Object.values(definition.operations)) {
      if (operation.public === false) {
        throw new Error(
          `operationResource "${definition.path}": operation "${operation.key}" ` +
            `sets public: false but the resource is public — an op cannot be ` +
            `more private than its controller. Move the resource off public ` +
            `and mark individual ops public instead.`,
        );
      }
    }
  }

  const routeKeys = new Set<string>();
  for (const operation of Object.values(definition.operations)) {
    assertOperationSchemas(definition, operation);
    // Lowercased: Express matches case-insensitively by default, so
    // two ops differing only in path casing are one wire route.
    const routeKey = `${operation.method}:${operation.path.toLowerCase()}`;
    if (routeKeys.has(routeKey)) {
      throw new Error(
        `operationResource "${definition.path}": duplicate route ` +
          `${operation.method} "${operation.path}" (operation "${operation.key}")`,
      );
    }
    routeKeys.add(routeKey);
  }

  const bearerAuth = definition.public !== true;
  const tags =
    definition.tags && definition.tags.length > 0
      ? [...definition.tags]
      : ['operations'];
  const operations = Object.values(definition.operations);
  const uniqueName = controllerClassName(definition.path);
  const paramsSchema = definition.paramsSchema;

  // One per-route Standard Schema pipe for every schema-carrying param
  // (body, query, params) — the same engine and the same `details`-bearing
  // 400 as generated CRUD. Params without a schema pass through untouched.
  @Controller(definition.path.replace(/^\//, ''))
  @ApiTags(...tags)
  @UsePipes(new StandardSchemaValidationPipe(rocketsSchemaValidation))
  class OperationResourceController {
    constructor(private readonly moduleRef: ModuleRef) {}
  }

  if (!bearerAuth) {
    AuthPublic({ classLevel: true })(OperationResourceController);
  }
  if (definition.decorators?.length) {
    for (const decorator of definition.decorators) {
      decorator(OperationResourceController);
    }
  }

  Object.defineProperty(OperationResourceController, 'name', {
    value: uniqueName,
  });

  for (const operation of operations) {
    attachOperationMethod(
      OperationResourceController,
      operation,
      uniqueName,
      paramsSchema,
      bearerAuth,
      handlerAliases,
      aclDecorators[operation.key],
    );
  }

  return OperationResourceController;
}

/**
 * Assert that the route Nest ACTUALLY registered is the route this
 * resource declared, then apply the SSE-specific rules on top.
 *
 * `applyDecorators` runs its list IN ORDER, and Nest's route decorators
 * are plain `Reflect.defineMetadata` writes with no merge: last write
 * wins. Both `@Sse(path)` and `@Get(path)`/`@Post(path)` write
 * `METHOD_METADATA` *and* `PATH_METADATA`, so a consumer decorator
 * appended to `operation.decorators` silently takes over either slot.
 *
 * Every other route protection in this package reads the DECLARED
 * `operation.method` / `operation.path` — the duplicate-route check in
 * `buildOperationController`, and the planner's cross-resource
 * collision validator. A hijacked route is therefore not merely wrong,
 * it is *invisible*: the app serves a route no audit knows about. That
 * is why this compares registration against declaration for EVERY
 * operation rather than only for the SSE case that first exposed it —
 * a per-site patch would leave `op.read({ decorators: [Post('x')] })`
 * doing exactly the same thing.
 *
 * Reading the metadata back in a second pass is the same technique the
 * `acl` / hand-written `AccessControlGrant` collision check below uses,
 * for the same reason: two writers, one metadata slot, no defined
 * winner → fail at definition time rather than ship a broken route.
 */
function assertRegisteredRouteShape(
  operation: CompiledOperationDescriptor,
  controllerClass: Type<unknown>,
  handler: object,
  label: string,
): void {
  const declaredSse = operation.responseMode === 'sse';
  const isSseRoute = Reflect.getMetadata(SSE_METADATA, handler) === true;

  if (isSseRoute && !declaredSse) {
    throw new Error(
      `operationResource: operation "${operation.key}" carries an @Sse() ` +
        `decorator but was not declared with \`op.sse()\` (responseMode ` +
        `"sse"). Core would still run the JSON output-DTO step over the ` +
        `handler's Observable. Use \`op.sse()\` instead of applying @Sse() ` +
        `through \`decorators\`.`,
    );
  }
  if (declaredSse && !isSseRoute) {
    // Belt and braces: no Nest route decorator CLEARS `SSE_METADATA`,
    // so reaching this needs a hand-written `Reflect.defineMetadata`.
    // Kept because the cost is one comparison and the failure mode —
    // an Observable serialized as a JSON body — is silent.
    throw new Error(
      `operationResource: SSE operation "${operation.key}" lost its @Sse() ` +
        `metadata — a decorator in \`decorators\` overwrote it. The route ` +
        `would return a raw Observable as a JSON body.`,
    );
  }

  // SSE declares GET and nothing else: it is the only method a browser's
  // native EventSource can issue. Checked on the DECLARATION as well as
  // the registration because `@Sse()` always registers GET — a
  // descriptor pairing `method: 'POST'` with `responseMode: 'sse'`
  // (reachable through `defineOperationResource`) would otherwise serve
  // a working GET route that every route audit files under POST.
  if (declaredSse && operation.method !== 'GET') {
    throw new Error(
      `operationResource: SSE operation "${operation.key}" declares method ` +
        `${operation.method}, but an SSE route must be GET — @Sse() always ` +
        `registers GET, so route collision checks would file this route ` +
        `under ${operation.method} while it serves GET "${operation.path}".`,
    );
  }

  // SSE has no JSON response body to validate; the interface documents
  // `output` as always `false` for these operations. Reachable through a
  // hand-built descriptor, where it would silently do nothing.
  if (declaredSse && operation.output !== false) {
    throw new Error(
      `operationResource: SSE operation "${operation.key}" declares an ` +
        `\`output\` schema. An SSE response body is the event stream, never ` +
        `a validated JSON value, so the output step never runs — the schema ` +
        `would be silently ignored. Set \`output: false\`.`,
    );
  }

  const registeredMethod: unknown = Reflect.getMetadata(
    METHOD_METADATA,
    handler,
  );
  if (registeredMethod !== RequestMethod[operation.method]) {
    throw new Error(
      `operationResource: operation "${operation.key}" declares method ` +
        `${operation.method} but registers as ` +
        `${describeRequestMethod(registeredMethod)} — a route decorator in ` +
        `\`decorators\` overwrote the generated one. Route collision checks ` +
        `read the declared method, so the served route would be invisible ` +
        `to them. Declare the method on the operation instead of applying a ` +
        `route decorator. (${label})`,
    );
  }

  const registeredPath: unknown = Reflect.getMetadata(PATH_METADATA, handler);
  if (
    normalizeRoutePath(registeredPath) !== normalizeRoutePath(operation.path)
  ) {
    throw new Error(
      `operationResource: operation "${operation.key}" declares path ` +
        `"${operation.path}" but registers as "${String(
          registeredPath,
        )}" — a ` +
        `route decorator in \`decorators\` overwrote the generated one. Route ` +
        `collision checks read the declared path, so the served route would ` +
        `be invisible to them. Set \`path\` on the operation instead of ` +
        `applying a route decorator. (${label})`,
    );
  }

  // Handler first, then the class: a resource-level
  // `decorators: [Transactional()]` applies to every route, and a
  // route-level `Transactional(false)` opts that one route back out.
  if (declaredSse && isTransactional(handler, controllerClass)) {
    throw new Error(
      `operationResource: SSE operation "${operation.key}" combines ` +
        `\`responseMode: "sse"\` with Transactional(). The handler returns ` +
        `its Observable immediately, so the transaction the interceptor ` +
        `opens commits before a single event is emitted — a silent no-op, ` +
        `not the guarantee the decorator reads as. Open a transaction ` +
        `inside the stream (TransactionScope.run) if a specific emission ` +
        `needs one. (${label})`,
    );
  }
}

/**
 * Nest's route decorators normalise an empty path to `'/'`
 * (`RequestMapping` via `metadata[PATH_METADATA] || '/'`, `Sse` via
 * `path && path.length ? path : '/'`), so the declared `''` and the
 * registered `'/'` are the same route and must compare equal.
 */
function normalizeRoutePath(value: unknown): string {
  if (typeof value !== 'string' || value === '') {
    return '/';
  }
  return value.startsWith('/') ? value : `/${value}`;
}

function describeRequestMethod(value: unknown): string {
  const name = Object.entries(RequestMethod).find(
    ([, enumValue]) => enumValue === value,
  )?.[0];
  return name ?? String(value);
}

function attachOperationMethod(
  controllerClass: Type<unknown>,
  operation: CompiledOperationDescriptor,
  controllerName: string,
  paramsSchema: z.ZodObject | undefined,
  controllerBearerAuth: boolean,
  handlerAliases: ReadonlyMap<unknown, symbol>,
  aclDecorators: readonly MethodDecorator[] | undefined,
): void {
  const methodName = operation.key;
  const isSse = operation.responseMode === 'sse';
  const routeDecorator = isSse
    ? Sse(operation.path)
    : METHOD_DECORATOR[operation.method](operation.path);

  const label = `${controllerName}.${methodName}`;
  const readsQuery =
    operation.method === 'GET' || operation.method === 'DELETE';

  // `body` / `query` / `validatedParams` arrive already validated by the
  // class-level pipe when the slot carries a schema; `params` is the raw
  // Nest params map, kept beside the validated one so a path param the
  // resource schema does not name (an extra `:repoId` on one operation)
  // still reaches the handler.
  async function routeHandler(
    this: { moduleRef: ModuleRef },
    body: unknown,
    query: Record<string, unknown>,
    params: Record<string, string>,
    validatedParams: Record<string, unknown>,
    request: NativeRequest,
    response: unknown,
    user: AuthorizedUser | undefined,
  ): Promise<unknown> {
    const input = readsQuery ? query : body;

    const operationRequest: OperationRequest = {
      headers: request.headers ?? {},
      params,
      query,
      raw: request,
    };

    const ctx: OperationContext<unknown, object> = {
      input,
      params:
        paramsSchema === undefined ? params : { ...params, ...validatedParams },
      query,
      request: operationRequest,
      response: { raw: response },
      user,
    };

    let result: unknown;
    const handlerClass = getHandlerClass(operation.handler);
    if (handlerClass !== undefined) {
      const contextId = ContextIdFactory.getByRequest(request);
      // Register the REQUEST under the context id before resolving:
      // this controller is statically scoped, so the request carries no
      // context id of its own and `getByRequest` mints a fresh one —
      // without registration, a handler (or any dependency in its
      // subtree) injecting `REQUEST` received `undefined` and 500'd on
      // every call, though the same class works fine as an ordinary
      // controller dependency.
      this.moduleRef.registerRequestByContextId(request, contextId);
      // Always strict: either the class is registered here, or a local
      // alias for it is. Never a global scan.
      const token: unknown = handlerAliases.get(handlerClass) ?? handlerClass;
      const instance = await this.moduleRef.resolve<{
        handle: (ctx: OperationContext<unknown, object>) => unknown;
      }>(token as never, contextId, { strict: true });
      result = await instance.handle(ctx);
    } else if (isHandlerFunction(operation.handler)) {
      const handler: OperationHandlerFn<unknown, unknown, object> =
        operation.handler;
      result = await handler(ctx);
    } else {
      throw new Error(`operationResource: invalid handler for "${label}"`);
    }

    if (isSse) {
      return maskSseStreamErrors(result, label);
    }
    if (operation.output === false) {
      return result;
    }
    return applyOutputSchema(operation.output, result, label);
  }

  Object.defineProperty(routeHandler, 'name', { value: methodName });

  const proto = controllerClass.prototype as Record<string, unknown>;
  proto[methodName] = routeHandler;

  const decorators: Array<
    ClassDecorator | MethodDecorator | PropertyDecorator
  > = [
    routeDecorator,
    HttpCode(operation.status),
    ApiOperation({
      summary: operation.summary ?? methodName,
      operationId: operationId(controllerName, operation),
    }),
  ];

  if (operation.public === true) {
    decorators.push(AuthPublic());
  } else if (controllerBearerAuth) {
    decorators.push(ApiBearerAuth());
  }
  if (operation.transactional === true) {
    decorators.push(Transactional());
  }
  if (isSse) {
    // Framing (the event stream itself) is not representable in OpenAPI
    // — documented as a stated non-goal, not a silent gap.
    decorators.push(
      ApiResponse({
        status: operation.status,
        description:
          'Server-Sent Events stream (text/event-stream) — not ' +
          'represented in the OpenAPI schema.',
      }),
    );
  } else if (operation.output !== false) {
    decorators.push(
      ApiResponse({
        status: operation.status,
        standardSchema: operation.output,
      }),
    );
  } else {
    decorators.push(ApiResponse({ status: operation.status }));
  }
  if (operation.decorators?.length) {
    decorators.push(...operation.decorators);
  }

  const descriptor = Object.getOwnPropertyDescriptor(proto, methodName);
  if (descriptor === undefined) {
    throw new Error(
      `operationResource: missing method descriptor for "${methodName}"`,
    );
  }
  applyDecorators(...decorators)(proto, methodName, descriptor);

  // The acl-derived grant is applied in a SECOND pass so the consumer's
  // decorators are readable in between. Upstream's grant metadata is a
  // plain SetMetadata — last write wins, no merge — so applying `acl`
  // after a hand-written AccessControlGrant silently REPLACED it: a
  // grant deliberately tighter than the inferred action was discarded,
  // and the route audit reported only the survivor. Two validators, one
  // slot, no defined winner → fail at definition time naming both.
  // (CRUD resources cannot do this — their controller is built
  // downstream of the planner — which is why their docs state the
  // limitation instead.)
  if (aclDecorators?.length && descriptor.value !== undefined) {
    // BOTH keys, not just the grant: `acl.query` pushes an
    // AccessControlQuery into the same second-pass array, and a manual
    // AccessControlQuery — a deliberately TIGHTER row filter — was
    // still silently replaced when only the grant key was read back.
    // Same defect, sibling slot.
    const grantKey = AccessControlGrant().KEY;
    const queryKey = AccessControlQuery().KEY;
    const manualGrant: unknown =
      (typeof grantKey === 'string'
        ? Reflect.getMetadata(grantKey, descriptor.value)
        : undefined) ??
      (typeof queryKey === 'string'
        ? Reflect.getMetadata(queryKey, descriptor.value)
        : undefined);
    if (manualGrant !== undefined) {
      throw new Error(
        `operationResource: operation "${operation.key}" declares \`acl\` ` +
          'AND carries a hand-written AccessControl* decorator. Grant ' +
          'metadata is last-write-wins — one would silently replace the ' +
          'other. Use `acl` (and its per-operation overrides) OR manual ' +
          'decorators on this operation, not both.',
      );
    }
    applyDecorators(...aclDecorators)(proto, methodName, descriptor);
  }
  if (operation.public === true && descriptor.value !== undefined) {
    Reflect.defineMetadata(
      SWAGGER_API_SECURITY_METADATA,
      [{}],
      descriptor.value,
    );
  }
  // LAST, after every decorator has written: the invariants below are
  // about the metadata that actually got registered, not the metadata
  // this file intended to register.
  if (descriptor.value !== undefined) {
    assertRegisteredRouteShape(
      operation,
      controllerClass,
      descriptor.value as object,
      label,
    );
  }
  Object.defineProperty(proto, methodName, descriptor);

  // A schema on the slot is what the class-level pipe validates AND what
  // Swagger documents: the body as a `$ref` to its named component, the
  // query / params expanded one parameter per property.
  const bodySchema = readsQuery ? undefined : operation.inputSchema;
  const querySchema = readsQuery ? operation.inputSchema : undefined;
  (bodySchema === undefined ? Body() : Body({ schema: bodySchema }))(
    proto,
    methodName,
    0,
  );
  (querySchema === undefined ? Query() : Query({ schema: querySchema }))(
    proto,
    methodName,
    1,
  );
  Param()(proto, methodName, 2);
  (paramsSchema === undefined ? Param() : Param({ schema: paramsSchema }))(
    proto,
    methodName,
    3,
  );
  Req()(proto, methodName, 4);
  Res({ passthrough: true })(proto, methodName, 5);
  AuthUser()(proto, methodName, 6);

  // Swagger's route-arg scan (`ParameterMetadataAccessor.explore`) reads
  // `design:paramtypes` FIRST and returns nothing when the method has
  // none — TypeScript emits that metadata for a decorated class method,
  // but `routeHandler` is a plain function assigned to the prototype, so
  // without this stamp every schema above validated and NONE documented
  // (no request body, no query, no path parameters). `Object` per slot
  // is what `emitDecoratorMetadata` writes for an untyped parameter: a
  // slot carrying a schema documents through it, and swagger drops a
  // schema-less `Object` slot, which is exactly what the raw params /
  // request / response / user slots should do.
  Reflect.defineMetadata(
    PARAMTYPES_METADATA,
    ROUTE_HANDLER_PARAMTYPES,
    proto,
    methodName,
  );
}

/** One entry per `routeHandler` parameter: body, query, params, validated params, request, response, user. */
const ROUTE_HANDLER_PARAMTYPES: readonly unknown[] = Object.freeze(
  Array.from({ length: 7 }, () => Object),
);
