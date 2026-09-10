import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Controller, Get, INestApplication } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ApiTags, ApiOkResponse } from '@nestjs/swagger';
import { RuntimeException } from '@concepta/nestjs-core';
import request from 'supertest';
import { ExceptionsFilter, ERROR_MESSAGE_FALLBACK } from './exceptions.filter';
import {
  attachErrorDetails,
  detailedErrorSerializer,
} from '@concepta/rockets-core';

class TestRuntimeException extends RuntimeException {
  constructor(
    options: ConstructorParameters<typeof RuntimeException>[0],
    code: string,
  ) {
    super(options);
    this.errorCode = code;
  }
}

@ApiTags('test-errors')
@Controller('test-errors')
class TestErrorController {
  @Get('runtime-500-with-safe')
  @ApiOkResponse({ description: 'Always throws — test route' })
  runtimeSafe500(): never {
    // Details attached on purpose: this is what makes the masking
    // assertion load-bearing. Without attachErrorDetails here,
    // `details` is undefined regardless of whether the 5xx mask runs.
    throw attachErrorDetails(
      new TestRuntimeException(
        {
          message: 'Internal error detail',
          httpStatus: 500,
          safeMessage: 'Something went wrong',
        },
        'RUNTIME_500_SAFE',
      ),
      [{ path: ['ref'], message: 'internal detail that must not leak' }],
    );
  }

  @Get('runtime-500-no-safe')
  @ApiOkResponse({ description: 'Always throws — test route' })
  runtimeNoSafe500(): never {
    throw new TestRuntimeException(
      {
        message: 'Raw internal error',
        httpStatus: 500,
      },
      'RUNTIME_500_NO_SAFE',
    );
  }

  @Get('runtime-400-with-safe')
  @ApiOkResponse({ description: 'Always throws — test route' })
  runtime400Safe(): never {
    throw new TestRuntimeException(
      {
        message: 'Bad input detail',
        httpStatus: 400,
        safeMessage: 'Invalid request',
      },
      'RUNTIME_400_SAFE',
    );
  }

  @Get('runtime-400-no-safe')
  @ApiOkResponse({ description: 'Always throws — test route' })
  runtime400NoSafe(): never {
    throw new TestRuntimeException(
      {
        message: 'Detailed client error',
        httpStatus: 400,
      },
      'RUNTIME_400_NO_SAFE',
    );
  }

  @Get('runtime-default-status')
  @ApiOkResponse({ description: 'Always throws — test route' })
  runtimeDefaultStatus(): never {
    throw new TestRuntimeException(
      { message: 'No explicit httpStatus set' },
      'RUNTIME_DEFAULT',
    );
  }

  @Get('runtime-400-no-safe-no-message')
  @ApiOkResponse({ description: 'Always throws — test route' })
  runtime400NoSafeNoMessage(): never {
    throw new TestRuntimeException(
      { message: '', httpStatus: 400 },
      'RUNTIME_400_EMPTY',
    );
  }

  @Get('details-attached-400')
  @ApiOkResponse({ description: 'Always throws — test route' })
  detailsAttached400(): never {
    throw attachErrorDetails(
      new TestRuntimeException(
        { message: 'Validation failed', httpStatus: 400 },
        'VALIDATION_ERR',
      ),
      [{ path: ['name'], message: 'app-attached finding' }],
    );
  }

  @Get('unknown-error')
  @ApiOkResponse({ description: 'Always throws — test route' })
  unknownError(): never {
    // eslint-disable-next-line @typescript-eslint/no-throw-literal
    throw { message: 'plain object error' };
  }
}

describe('ExceptionsFilter (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TestErrorController],
    }).compile();

    app = moduleRef.createNestApplication();

    const httpAdapterHost = app.get(HttpAdapterHost);
    app.useGlobalFilters(new ExceptionsFilter(httpAdapterHost));

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should return safeMessage for RuntimeException with httpStatus 500 and safeMessage', async () => {
    const response = await request(app.getHttpServer())
      .get('/test-errors/runtime-500-with-safe')
      .expect(500);

    expect(response.body.statusCode).toBe(500);
    expect(response.body.errorCode).toBe('RUNTIME_500_SAFE');
    expect(response.body.message).toBe('Something went wrong');
    expect(response.body.timestamp).toBeDefined();
  });

  it('should return fallback message for RuntimeException with httpStatus 500 and no safeMessage', async () => {
    const response = await request(app.getHttpServer())
      .get('/test-errors/runtime-500-no-safe')
      .expect(500);

    expect(response.body.statusCode).toBe(500);
    expect(response.body.errorCode).toBe('RUNTIME_500_NO_SAFE');
    expect(response.body.message).toBe(ERROR_MESSAGE_FALLBACK);
  });

  it('should return safeMessage for RuntimeException with httpStatus 400 and safeMessage', async () => {
    const response = await request(app.getHttpServer())
      .get('/test-errors/runtime-400-with-safe')
      .expect(400);

    expect(response.body.statusCode).toBe(400);
    expect(response.body.errorCode).toBe('RUNTIME_400_SAFE');
    expect(response.body.message).toBe('Invalid request');
  });

  it('should return exception.message for RuntimeException with httpStatus 400 and no safeMessage', async () => {
    const response = await request(app.getHttpServer())
      .get('/test-errors/runtime-400-no-safe')
      .expect(400);

    expect(response.body.statusCode).toBe(400);
    expect(response.body.errorCode).toBe('RUNTIME_400_NO_SAFE');
    expect(response.body.message).toBe('Detailed client error');
  });

  it('should default to 500 when RuntimeException has no explicit httpStatus override', async () => {
    const response = await request(app.getHttpServer())
      .get('/test-errors/runtime-default-status')
      .expect(500);

    expect(response.body.statusCode).toBe(500);
    expect(response.body.errorCode).toBe('RUNTIME_DEFAULT');
    expect(response.body.message).toBe(ERROR_MESSAGE_FALLBACK);
  });

  it('should return empty string message for 400 when message is empty and no safeMessage', async () => {
    const response = await request(app.getHttpServer())
      .get('/test-errors/runtime-400-no-safe-no-message')
      .expect(400);

    expect(response.body.statusCode).toBe(400);
    expect(response.body.errorCode).toBe('RUNTIME_400_EMPTY');
    expect(response.body.message).toBe('');
  });

  it('never emits details with the default serializer', async () => {
    const response = await request(app.getHttpServer())
      .get('/test-errors/details-attached-400')
      .expect(400);

    expect(response.body.statusCode).toBe(400);
    expect(response.body.message).toBe('Validation failed');
    expect(response.body.details).toBeUndefined();
  });

  it('should handle unknown error objects with defaults', async () => {
    const response = await request(app.getHttpServer())
      .get('/test-errors/unknown-error')
      .expect(500);

    expect(response.body.statusCode).toBe(500);
    expect(response.body.errorCode).toBe('ERROR_CODE_UNKNOWN');
    expect(response.body.message).toBe(ERROR_MESSAGE_FALLBACK);
  });
});

describe('ExceptionsFilter with detailedErrorSerializer (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TestErrorController],
    }).compile();

    app = moduleRef.createNestApplication();

    const httpAdapterHost = app.get(HttpAdapterHost);
    app.useGlobalFilters(
      new ExceptionsFilter(httpAdapterHost, detailedErrorSerializer),
    );

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // The default serializer never emits details, so this is the only
  // observer of the attachErrorDetails → wire channel on a 4xx.
  it('emits app-attached details on a 4xx', async () => {
    const response = await request(app.getHttpServer())
      .get('/test-errors/details-attached-400')
      .expect(400);

    expect(response.body.details).toEqual([
      { path: ['name'], message: 'app-attached finding' },
    ]);
    expect(response.body.message).toBe('Validation failed');
  });

  it('masks details on a 5xx', async () => {
    // runtimeSafe500 attaches details via attachErrorDetails — this
    // assertion only proves masking because there is something to mask.
    const response = await request(app.getHttpServer())
      .get('/test-errors/runtime-500-with-safe')
      .expect(500);

    expect(response.body.details).toBeUndefined();
  });
});
