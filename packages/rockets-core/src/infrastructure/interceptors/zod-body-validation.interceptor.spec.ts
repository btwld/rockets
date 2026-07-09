import {
  BadRequestException,
  type CallHandler,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CrudValidate } from '@concepta/nestjs-crud';
import { lastValueFrom, of } from 'rxjs';
import { ZodBodyValidationInterceptor } from './zod-body-validation.interceptor';

describe('ZodBodyValidationInterceptor', () => {
  class TestController {
    create(): void {
      return undefined;
    }
  }

  const handler = TestController.prototype.create;
  const target = TestController;

  afterEach(() => {
    Reflect.deleteMetadata(CrudValidate.KEY as string, handler);
  });

  it('validates against the DTO Standard Schema and replaces the body with parsed output', async () => {
    class CreatePetDto {}
    Object.defineProperty(CreatePetDto, 'schema', {
      value: {
        '~standard': {
          version: 1,
          validate: async (value: unknown) => ({
            value: { name: 'Rex', age: 3, original: value },
          }),
        },
      },
    });
    Reflect.defineMetadata(
      CrudValidate.KEY as string,
      { expectedType: CreatePetDto },
      handler,
    );

    const req = { body: { name: 'Rex', age: '3' } };
    const interceptor = new ZodBodyValidationInterceptor(new Reflector());
    const output = await interceptor.intercept(
      createContext(req),
      createCallHandler('ok'),
    );

    await expect(lastValueFrom(output)).resolves.toBe('ok');
    expect(req.body).toEqual({
      name: 'Rex',
      age: 3,
      original: { name: 'Rex', age: '3' },
    });
  });

  it('throws BadRequestException with Standard Schema path messages', async () => {
    class CreatePetDto {}
    Object.defineProperty(CreatePetDto, 'schema', {
      value: {
        '~standard': {
          version: 1,
          validate: () => ({
            issues: [
              {
                path: ['owner', { key: 'email' }],
                message: 'Invalid email',
              },
            ],
          }),
        },
      },
    });
    Reflect.defineMetadata(
      CrudValidate.KEY as string,
      { expectedType: CreatePetDto },
      handler,
    );

    const interceptor = new ZodBodyValidationInterceptor(new Reflector());

    await expect(
      interceptor.intercept(
        createContext({ body: {} }),
        createCallHandler('ok'),
      ),
    ).rejects.toThrow(BadRequestException);
    await expect(
      interceptor.intercept(
        createContext({ body: {} }),
        createCallHandler('ok'),
      ),
    ).rejects.toMatchObject({
      response: {
        message: 'owner.email: Invalid email',
      },
    });
  });

  it('passes through when the CRUD expected type has no Standard Schema', async () => {
    class CreatePetDto {}
    Reflect.defineMetadata(
      CrudValidate.KEY as string,
      { expectedType: CreatePetDto },
      handler,
    );

    const req = { body: { name: 'Rex' } };
    const interceptor = new ZodBodyValidationInterceptor(new Reflector());
    const output = await interceptor.intercept(
      createContext(req),
      createCallHandler('ok'),
    );

    await expect(lastValueFrom(output)).resolves.toBe('ok');
    expect(req.body).toEqual({ name: 'Rex' });
  });

  function createCallHandler(value: string): CallHandler {
    return {
      handle: () => of(value),
    };
  }

  function createContext(req: { body?: unknown }): ExecutionContext {
    return {
      getClass: () => target,
      getHandler: () => handler,
      switchToHttp: () => ({
        getRequest: <T = typeof req>() => req as T,
        getResponse: <T = unknown>() => undefined as T,
        getNext: <T = unknown>() => undefined as T,
      }),
      switchToRpc: () => ({
        getContext: <T = unknown>() => undefined as T,
        getData: <T = unknown>() => undefined as T,
      }),
      switchToWs: () => ({
        getClient: <T = unknown>() => undefined as T,
        getData: <T = unknown>() => undefined as T,
        getPattern: () => undefined,
      }),
      getArgs: <T extends Array<unknown> = Array<unknown>>() => [] as T,
      getArgByIndex: <T = unknown>() => undefined as T,
      getType: () => 'http',
    };
  }
});
