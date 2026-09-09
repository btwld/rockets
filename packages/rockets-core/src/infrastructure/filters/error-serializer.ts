import type { PlainLiteralObject } from '@nestjs/common';

import type { OperationRequest } from '../../domain/interfaces/operation-resource.interface';
import type { RocketsErrorDetail } from '../../domain/interfaces/error-detail.interface';

export type { RocketsErrorDetail } from '../../domain/interfaces/error-detail.interface';

/**
 * DI token for a {@link RocketsErrorSerializerInterface}.
 *
 * Only needed when the filter is registered through Nest
 * (`{ provide: APP_FILTER, useClass: RocketsCoreExceptionsFilter }`).
 * Apps that construct the filter themselves in `main.ts` — the pattern
 * both sample servers use — pass the serializer as the second
 * constructor argument instead.
 */
export const ROCKETS_ERROR_SERIALIZER_TOKEN = Symbol(
  'ROCKETS_ERROR_SERIALIZER_TOKEN',
);

/**
 * Everything `RocketsCoreExceptionsFilter` resolved before writing the
 * response, handed to the serializer so an app can shape the envelope
 * without re-implementing the unwrap chain.
 *
 * The status code is NOT part of what a serializer decides: it is the
 * result of the domain-exception → 4xx mapping and the
 * `context.originalError` unwrap, which is the property apps most often
 * broke by forking the filter (miss the chain and every hook `409`
 * becomes a `500`). Shape the body freely; the status stays authoritative.
 */
export interface RocketsErrorContext {
  /** HTTP status the filter will reply with. */
  readonly statusCode: number;
  /** Stable machine-readable code (`mapHttpStatus` or `errorCode`). */
  readonly errorCode: string;
  /**
   * Client-safe message. A `string` normally; a `string[]` for flattened
   * validation errors; whatever the `HttpException` response carried
   * when it was neither.
   */
  readonly message: unknown;
  /**
   * The exception as thrown, before any unwrapping — the only thing here
   * a serializer cannot reconstruct from the resolved fields, and what a
   * correlation id or a structured log line is built from.
   *
   * `unknown` because Nest hands the filter whatever was raised: a
   * Rockets `RuntimeException`, a Nest `HttpException`, or a bare
   * `Error` from third-party code. Narrow it before reading anything off
   * it.
   *
   * NEVER spread or serialize this into the response body. The
   * documented pattern is "spread the default and add" — one careless
   * `...context` instead of `...defaultErrorSerializer.serialize(context)`
   * puts a stack trace (and whatever the exception carries) on the
   * wire. Read specific fields off it; emit none of it.
   *
   * The POST-unwrap exception is deliberately absent. Interpreting it
   * requires knowing the unwrap semantics the filter keeps to itself,
   * and everything it would be read for — status, code, message — is
   * already resolved above.
   */
  readonly originalException: unknown;
  /**
   * Structured findings behind a validation `400`, when the failure has
   * them — Standard Schema issues, unrecognized strict
   * keys (one entry per key). Absent on non-validation errors. The
   * human-readable `message` above stays untouched; this is the field a
   * client branches on instead of parsing strings.
   */
  readonly details?: readonly RocketsErrorDetail[];
  /**
   * The request being answered, in the same transport-agnostic shape
   * `operationResource` handlers already receive — typed `headers` /
   * `params` / `query`, `raw` as the documented escape hatch. This is
   * what a serializer builds a correlation id from without forking the
   * filter. A serializer returns a BODY only — there is no response
   * seam here, so setting headers (e.g. `Retry-After`) still requires
   * the app's own filter or interceptor.
   */
  readonly request?: OperationRequest;
}

/**
 * Strategy for turning a resolved error into the response body.
 *
 * @example
 * ```ts
 * class MyEnvelope implements RocketsErrorSerializerInterface {
 *   serialize({ statusCode, errorCode, message }: RocketsErrorContext) {
 *     return { error: { code: errorCode, detail: message }, status: statusCode };
 *   }
 * }
 *
 * app.useGlobalFilters(
 *   new RocketsCoreExceptionsFilter(httpAdapterHost, new MyEnvelope()),
 * );
 * ```
 */
export interface RocketsErrorSerializerInterface {
  /**
   * Returns the response body. An object, not `unknown`: the documented
   * pattern is to spread the default and add to it, and a spread of
   * `unknown` does not compile.
   */
  serialize(context: RocketsErrorContext): PlainLiteralObject;
}

/**
 * The envelope Rockets has always produced. Kept as the default so
 * existing apps see no change, and exported so a custom serializer can
 * extend it (`{ ...defaultErrorSerializer.serialize(ctx), traceId }`)
 * instead of restating the four keys.
 */
export const defaultErrorSerializer: RocketsErrorSerializerInterface = {
  serialize({
    statusCode,
    errorCode,
    message,
  }: RocketsErrorContext): PlainLiteralObject {
    return {
      statusCode,
      errorCode,
      message,
      timestamp: new Date().toISOString(),
    };
  },
};

/**
 * The default envelope plus `details` when the error carries them.
 * Split from {@link defaultErrorSerializer} deliberately: adding a key
 * to the default would change every existing response body shape;
 * opting in keeps the long-standing envelope byte-identical for apps
 * that never asked.
 */
export const detailedErrorSerializer: RocketsErrorSerializerInterface = {
  serialize(context: RocketsErrorContext): PlainLiteralObject {
    return {
      ...defaultErrorSerializer.serialize(context),
      ...(context.details ? { details: context.details } : {}),
    };
  },
};
