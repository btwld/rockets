import { BadRequestException, PipeTransform } from '@nestjs/common';

/**
 * Minimal structural typing for the Standard Schema v1 spec
 * (https://standardschema.dev) — the vendor-neutral validation contract
 * implemented by zod v4, valibot, arktype, and adopted natively by the
 * NestJS v12 route decorators.
 *
 * Declared locally on purpose: rockets-crud stays free of any
 * validation-library dependency (same principle as the repository
 * layer's DB-agnosticism — backends must remain swappable).
 */
export interface StandardSchemaV1<Output = unknown> {
  readonly '~standard': StandardSchemaV1Props<Output>;
}

export interface StandardSchemaV1Props<Output = unknown> {
  readonly version: 1;
  readonly vendor: string;
  readonly validate: (
    value: unknown,
  ) => StandardSchemaV1Result<Output> | Promise<StandardSchemaV1Result<Output>>;
}

/**
 * Spec: success → `{ value }` (no `issues` key); failure → `{ issues }`.
 * Typed as one structural interface so consumers narrow on `issues`
 * without depending on discriminated-union inference.
 */
export interface StandardSchemaV1Result<Output = unknown> {
  readonly value?: Output;
  readonly issues?: ReadonlyArray<StandardSchemaV1Issue>;
}

export interface StandardSchemaV1Issue {
  readonly message: string;
  readonly path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }>;
}

/**
 * Returns the Standard Schema attached to a DTO class via its static
 * `schema` property, or `undefined`. The static-`schema` convention is
 * shared with `nestjs-zod`'s `createZodDto`, so DTOs from that library
 * (or any schema-compiled DTO) are detected with no extra wiring.
 */
export function getStandardSchema(
  candidate: unknown,
): StandardSchemaV1 | undefined {
  if (typeof candidate !== 'function') {
    return undefined;
  }
  const schema: unknown = Reflect.get(candidate, 'schema');
  return isStandardSchema(schema) ? schema : undefined;
}

function isStandardSchema(value: unknown): value is StandardSchemaV1 {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const props: unknown = Reflect.get(value, '~standard');
  if (typeof props !== 'object' || props === null) {
    return false;
  }
  return (
    Reflect.get(props, 'version') === 1 &&
    typeof Reflect.get(props, 'validate') === 'function'
  );
}

/**
 * Body validation through the DTO's own Standard Schema — the schema
 * that GENERATED the DTO does the validating, so rules with no
 * class-validator equivalent (zod `.refine()`, custom checks, coercion)
 * are enforced with full fidelity.
 *
 * Installed by `CrudInitValidation` AHEAD of the class-validator
 * `ValidationPipe` whenever the route's `expectedType` carries a
 * Standard Schema. The pipe returns the schema's parsed output (unknown
 * keys stripped, defaults applied); the downstream `ValidationPipe`
 * still runs for class-transformer instantiation.
 */
export class CrudStandardSchemaValidationPipe implements PipeTransform {
  constructor(private readonly schema: StandardSchemaV1) {}

  async transform(value: unknown): Promise<unknown> {
    const result = await this.schema['~standard'].validate(value);
    if (result.issues !== undefined) {
      throw new BadRequestException({
        statusCode: 400,
        message: result.issues.map(formatIssue),
        error: 'Bad Request',
      });
    }
    return result.value;
  }
}

function formatIssue(issue: StandardSchemaV1Issue): string {
  const path = (issue.path ?? [])
    .map((segment) =>
      typeof segment === 'object' ? String(segment.key) : String(segment),
    )
    .join('.');
  return path.length > 0 ? `${path}: ${issue.message}` : issue.message;
}
