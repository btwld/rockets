import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Observable } from 'rxjs';
import { CrudValidate } from '@concepta/nestjs-crud';
import {
  getStandardSchema,
  standardSchemaBadRequest,
} from '../../common/utils/standard-schema.util';

/**
 * Validates the raw request body against a Standard Schema carried by the CRUD
 * route's expected DTO type. NestJS's standard `ValidationPipe` uses
 * class-validator, which knows nothing about schema-based DTO constraints, so
 * required fields silently pass without this interceptor.
 *
 * Intentionally avoids importing any schema library. `nestjs-zod` DTOs already
 * expose this contract on the generated class. Nest 12's native pipe reads a
 * schema passed to the route param decorator; this bridge keeps Rockets' class
 * based CRUD contract while using the same vendor-neutral validation contract.
 */
@Injectable()
export class ZodBodyValidationInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const handler = context.getHandler();
    const target = context.getClass();

    const validation = this.reflector.getAllAndOverride<
      { expectedType?: unknown } | undefined
    >(CrudValidate.KEY as string, [handler, target]);

    const standardSchema = getStandardSchema(validation?.expectedType);
    if (!standardSchema) {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest<{ body?: unknown }>();
    const result = await standardSchema['~standard'].validate(req.body);

    if (result.issues) {
      throw standardSchemaBadRequest(result.issues);
    }

    req.body = result.value;
    return next.handle();
  }
}
