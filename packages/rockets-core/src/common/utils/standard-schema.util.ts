import {
  BadRequestException,
  type StandardSchemaValidationPipeOptions,
} from '@nestjs/common';
import type { StandardSchemaV1 } from '@standard-schema/spec';

import { attachErrorDetails } from './validation-error-details.util';

/**
 * Pipe options every Rockets route validates with: the 400 carries
 * structured `details` (issue #55) instead of Nest's bare message list.
 * Generated CRUD passes it as `request.validation`; hand-written routes
 * use `@UsePipes(new StandardSchemaValidationPipe(rocketsSchemaValidation))`.
 */
export const rocketsSchemaValidation: StandardSchemaValidationPipeOptions = {
  exceptionFactory: standardSchemaBadRequest,
};

/** Returns whether a value implements Standard Schema V1. */
export function isStandardSchema(value: unknown): value is StandardSchemaV1 {
  if (!isObjectLike(value)) {
    return false;
  }

  const standard = value['~standard'];

  return (
    isObjectLike(standard) &&
    standard.version === 1 &&
    typeof standard.validate === 'function'
  );
}

function isObjectLike(value: unknown): value is Record<PropertyKey, unknown> {
  return (
    (typeof value === 'object' && value !== null) || typeof value === 'function'
  );
}

export function standardSchemaIssuesToMessages(
  issues: ReadonlyArray<StandardSchemaV1.Issue>,
): string[] {
  return issues.map((issue) => {
    const field = Array.isArray(issue.path)
      ? issue.path.map(pathSegmentToString).join('.')
      : '';
    return field ? `${field}: ${issue.message}` : issue.message;
  });
}

/**
 * Structured details for the same issues `standardSchemaIssuesToMessages`
 * flattens. Zod's `unrecognized_keys` issue carries `path: []` and the
 * offending keys in a `keys` array — fanned out here into one detail per
 * key, addressed AT the key, because a detail pointing at the object
 * root names nothing a client can highlight.
 */
export function standardSchemaIssuesToDetails(
  issues: ReadonlyArray<StandardSchemaV1.Issue>,
): Array<{ path: (string | number)[]; message: string }> {
  return issues.flatMap((issue) => {
    const path = (issue.path ?? []).map(pathSegmentToKey);
    // Gated on zod's issue CODE, not on the presence of a `keys` array:
    // any other Standard Schema vendor whose issues happen to carry
    // `keys` would have its own message silently replaced by our
    // hardcoded English string — and a localized zod message would gain
    // an un-localized twin. With one key, the issue's own message IS
    // the per-key message; only the multi-key case needs splitting.
    const keys: unknown = Reflect.get(issue, 'keys');
    if (
      Reflect.get(issue, 'code') === 'unrecognized_keys' &&
      Array.isArray(keys) &&
      keys.length > 0
    ) {
      const stringKeys = keys.filter(
        (key): key is string => typeof key === 'string',
      );
      // Exotic non-string keys: fall through to the plain issue rather
      // than returning [] — details must never be a silent SUBSET of
      // what the message channel reports.
      if (stringKeys.length === 0) {
        return [{ path, message: issue.message }];
      }
      return stringKeys.map((key) => ({
        path: [...path, key],
        message:
          stringKeys.length === 1
            ? issue.message
            : `Unrecognized key: "${key}"`,
      }));
    }
    return [{ path, message: issue.message }];
  });
}

export function standardSchemaBadRequest(
  issues: ReadonlyArray<StandardSchemaV1.Issue>,
): BadRequestException {
  const messages = standardSchemaIssuesToMessages(issues);
  // Details ride the exception INSTANCE under a symbol, never the
  // response payload: a payload key would change the 400 body of every
  // app that runs WITHOUT the Rockets filter (Nest's default filter
  // replies with the payload verbatim) — an opt-out nobody asked for.
  return attachErrorDetails(
    new BadRequestException({
      statusCode: 400,
      // Long-standing polymorphism (string for one issue, array for
      // many) kept on purpose: it is what existing clients parse, and
      // the details channel makes parsing it unnecessary — once the app
      // opts in to the filter and a details-aware serializer.
      message: messages.length === 1 ? messages[0] : messages,
      error: 'Bad Request',
    }),
    standardSchemaIssuesToDetails(issues),
  );
}

function pathSegmentToString(
  segment: PropertyKey | StandardSchemaV1.PathSegment,
): string {
  return String(pathSegmentToKey(segment));
}

/** Preserves numeric segments — `0` (index) and `"0"` (key) differ. */
function pathSegmentToKey(
  segment: PropertyKey | StandardSchemaV1.PathSegment,
): string | number {
  const key =
    typeof segment === 'object' && segment !== null ? segment.key : segment;
  return typeof key === 'number' ? key : String(key);
}
