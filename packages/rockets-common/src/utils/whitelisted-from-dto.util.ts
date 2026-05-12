import { BadRequestException, type Type } from '@nestjs/common';
import { instanceToPlain, plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

/**
 * When input is a loose `object` (or the DTO class is chosen at runtime),
 * map with `dtoClass`, run `class-validator` with whitelist, and return a
 * plain object. Drops unknown keys; validation failures throw
 * `BadRequestException`.
 *
 * `T` defaults to `Record<string, unknown>` for back-compat. Pass an explicit
 * type at the call site to skip a downstream cast (e.g.
 * `whitelistedFromDto<RocketsAuthUserMetadataUpdatableInterface>(...)`).
 */
export async function whitelistedFromDto<
  T extends Record<string, unknown> = Record<string, unknown>,
>(dtoClass: Type<unknown>, data: object): Promise<T> {
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
