import { BadRequestException, type Type } from '@nestjs/common';
import { instanceToPlain, plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

/**
 * When input is a loose `object` (or the DTO class is chosen at runtime), map with `Dto`,
 * run `class-validator` with whitelist, return a **plain** object. Drops unknown keys;
 * validation failures throw `BadRequestException`.
 */
export async function whitelistedFromDto(
  Dto: Type<unknown>,
  data: object,
): Promise<Record<string, unknown>> {
  const instance = plainToInstance(Dto, data, {
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
  return instanceToPlain(instance as object) as Record<string, unknown>;
}
