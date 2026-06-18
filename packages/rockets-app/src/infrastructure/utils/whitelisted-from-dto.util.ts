import { BadRequestException, type Type } from '@nestjs/common';
import { instanceToPlain, plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

/**
 * Minimal structural typing for the Standard Schema v1 spec
 * (https://standardschema.dev). Declared locally on purpose: `rockets-app`
 * stays free of any validation-library dependency, so a schema-compiled
 * DTO (e.g. `nestjs-zod`'s `createZodDto`) is detected by shape alone —
 * the same vendor-neutral posture as `rockets-crud`.
 */
interface StandardSchemaV1<Output = unknown> {
  readonly '~standard': {
    readonly version: 1;
    readonly validate: (
      value: unknown,
    ) => StandardResult<Output> | Promise<StandardResult<Output>>;
  };
}

interface StandardResult<Output = unknown> {
  readonly value?: Output;
  readonly issues?: ReadonlyArray<{ readonly message: string }>;
}

/**
 * The Standard Schema attached to a DTO class via its static `schema`
 * property (the `createZodDto` convention), or `undefined`.
 */
function getStandardSchema(
  dtoClass: Type<unknown>,
): StandardSchemaV1 | undefined {
  const schema: unknown = Reflect.get(dtoClass, 'schema');
  if (typeof schema !== 'object' || schema === null) {
    return undefined;
  }
  const props: unknown = Reflect.get(schema, '~standard');
  if (typeof props !== 'object' || props === null) {
    return undefined;
  }
  return Reflect.get(props, 'version') === 1 &&
    typeof Reflect.get(props, 'validate') === 'function'
    ? (schema as StandardSchemaV1)
    : undefined;
}

/**
 * When input is a loose `object` (or the DTO class is chosen at runtime),
 * validate it against `dtoClass` and return a plain object with unknown
 * keys dropped. Validation failures throw `BadRequestException`.
 *
 * Two DTO styles are supported transparently:
 * - **Standard Schema** DTOs (zod via `createZodDto`, …) — validated and
 *   whitelisted by the schema that generated the DTO, so `.refine()`,
 *   coercions and defaults all apply.
 * - **class-validator** DTOs — mapped with class-transformer, validated
 *   with whitelist.
 *
 * `T` defaults to `Record<string, unknown>` for back-compat. Pass an explicit
 * type at the call site to skip a downstream cast (e.g.
 * `whitelistedFromDto<RocketsAuthUserMetadataUpdatableInterface>(...)`).
 */
export async function whitelistedFromDto<
  T extends Record<string, unknown> = Record<string, unknown>,
>(dtoClass: Type<unknown>, data: object): Promise<T> {
  const standard = getStandardSchema(dtoClass);
  if (standard) {
    const result = await standard['~standard'].validate(data);
    if (result.issues !== undefined) {
      throw new BadRequestException({
        statusCode: 400,
        message: result.issues.map((issue) => issue.message),
        error: 'Bad Request',
      });
    }
    return (result.value ?? {}) as T;
  }

  const instance = plainToInstance(dtoClass, data, {
    enableImplicitConversion: true,
  });
  const errors = await validate(instance as object, {
    whitelist: true,
    forbidNonWhitelisted: false,
    forbidUnknownValues: true,
    skipMissingProperties: true,
  });
  if (errors.length) {
    throw new BadRequestException({
      statusCode: 400,
      message: errors.flatMap((e) => Object.values(e.constraints ?? {})),
      error: 'Bad Request',
    });
  }
  return instanceToPlain(instance as object) as T;
}
