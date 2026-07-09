import { BadRequestException, type Type } from '@nestjs/common';
import { instanceToPlain, plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  getStandardSchema,
  standardSchemaBadRequest,
} from './standard-schema.util';

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
      throw standardSchemaBadRequest(result.issues);
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
