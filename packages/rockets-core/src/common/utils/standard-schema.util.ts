import { BadRequestException } from '@nestjs/common';

export interface StandardSchemaV1<Output = unknown> {
  readonly '~standard': {
    readonly version: 1;
    readonly validate: (
      value: unknown,
      options?: Record<string, unknown>,
    ) => StandardResult<Output> | Promise<StandardResult<Output>>;
  };
}

interface StandardPathSegment {
  readonly key: PropertyKey;
}

interface StandardIssue {
  readonly path?: ReadonlyArray<PropertyKey | StandardPathSegment>;
  readonly message: string;
}

interface StandardResult<Output = unknown> {
  readonly value?: Output;
  readonly issues?: ReadonlyArray<StandardIssue>;
}

export function getStandardSchema(type: unknown): StandardSchemaV1 | undefined {
  if (!type || (typeof type !== 'function' && typeof type !== 'object')) {
    return undefined;
  }

  const schema = Reflect.get(type, 'schema');
  if (typeof schema !== 'object' || schema === null) {
    return undefined;
  }

  const standard = Reflect.get(schema, '~standard');
  if (typeof standard !== 'object' || standard === null) {
    return undefined;
  }

  return Reflect.get(standard, 'version') === 1 &&
    typeof Reflect.get(standard, 'validate') === 'function'
    ? (schema as StandardSchemaV1)
    : undefined;
}

export function standardSchemaIssuesToMessages(
  issues: ReadonlyArray<StandardIssue>,
): string[] {
  return issues.map((issue) => {
    const field = Array.isArray(issue.path)
      ? issue.path.map(pathSegmentToString).join('.')
      : '';
    return field ? `${field}: ${issue.message}` : issue.message;
  });
}

export function standardSchemaBadRequest(
  issues: ReadonlyArray<StandardIssue>,
): BadRequestException {
  const messages = standardSchemaIssuesToMessages(issues);
  return new BadRequestException({
    statusCode: 400,
    message: messages.length === 1 ? messages[0] : messages,
    error: 'Bad Request',
  });
}

function pathSegmentToString(
  segment: PropertyKey | StandardPathSegment,
): string {
  if (typeof segment === 'object' && segment !== null) {
    return String(segment.key);
  }
  return String(segment);
}
