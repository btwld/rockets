import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Observable } from 'rxjs';
import { CrudValidate } from '@concepta/nestjs-crud';

interface ZodSchemaDuck {
  safeParse(
    value: unknown,
  ): { success: true } | { success: false; error: { issues: unknown[] } };
}

interface ZodDtoDuck {
  isZodDto: true;
  schema: ZodSchemaDuck;
}

function isZodDtoDuck(type: unknown): type is ZodDtoDuck {
  if (!type || (typeof type !== 'function' && typeof type !== 'object'))
    return false;
  const t = type as Record<string, unknown>;
  return (
    t['isZodDto'] === true &&
    typeof t['schema'] === 'object' &&
    t['schema'] !== null
  );
}

/**
 * Validates the raw request body against the zod schema when the CRUD route's
 * expected DTO type is a nestjs-zod DTO. NestJS's standard `ValidationPipe`
 * uses class-validator, which knows nothing about zod constraints, so required
 * fields silently pass without this interceptor.
 *
 * Intentionally avoids importing nestjs-zod (core must stay validation-library-
 * neutral) and duck-types the DTO's `.isZodDto` / `.schema` instead.
 */
@Injectable()
export class ZodBodyValidationInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const handler = context.getHandler();
    const target = context.getClass();

    const validation = this.reflector.getAllAndOverride<
      { expectedType?: unknown } | undefined
    >(CrudValidate.KEY as string, [handler, target]);

    const expectedType = validation?.expectedType;
    if (!isZodDtoDuck(expectedType)) {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest<{ body?: unknown }>();
    const body: unknown = req.body;
    const result = expectedType.schema.safeParse(body);

    if (!result.success) {
      const messages = result.error.issues.map((issue) => {
        const i = issue as { path?: unknown[]; message?: string };
        const field = Array.isArray(i.path) ? i.path.join('.') : '';
        return field
          ? `${field}: ${i.message ?? 'invalid'}`
          : i.message ?? 'invalid';
      });
      throw new BadRequestException({
        statusCode: 400,
        message: messages.length === 1 ? messages[0] : messages,
        error: 'Bad Request',
      });
    }

    return next.handle();
  }
}
