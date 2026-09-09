import { describe, it, expect } from 'vitest';
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  StandardSchemaValidationPipe,
  UsePipes,
  type Type,
} from '@nestjs/common';
import { AuthPublic } from '@concepta/nestjs-authentication';
import { z } from 'zod';
import { collectRouteAudit } from './collect-route-audit';
import { AuthSession } from '../../decorators/auth-session.decorator';

@Controller('profile')
class ProfileController {
  @Get()
  read() {}

  @AuthSession()
  @Post()
  update() {}
}

@Controller('health')
class HealthController {
  @AuthPublic()
  @Get()
  ping() {}
}

@Controller('contradiction')
class ContradictionController {
  @AuthPublic()
  @AuthSession()
  @Post()
  bad() {}
}

describe('collectRouteAudit — sessionAuth (issue #58)', () => {
  it('reports sessionAuth: false on a route without @AuthSession()', () => {
    const report = collectRouteAudit({
      controllers: [
        { controller: ProfileController, methodNames: ['read', 'update'] },
      ],
      globalGuards: ['AuthServerGuard'],
      authGuards: ['AuthServerGuard'],
    });

    const readRoute = report.routes.find((r) => r.handler === 'read');
    expect(readRoute?.sessionAuth).toBe(false);
    expect(readRoute?.authentication).toBe('guarded');
  });

  it('reports sessionAuth: true on an @AuthSession() route, still guarded', () => {
    const report = collectRouteAudit({
      controllers: [
        { controller: ProfileController, methodNames: ['read', 'update'] },
      ],
      globalGuards: ['AuthServerGuard'],
      authGuards: ['AuthServerGuard'],
    });

    const updateRoute = report.routes.find((r) => r.handler === 'update');
    expect(updateRoute?.sessionAuth).toBe(true);
    expect(updateRoute?.authentication).toBe('guarded');
  });

  it('a public route reports sessionAuth: false', () => {
    const report = collectRouteAudit({
      controllers: [{ controller: HealthController, methodNames: ['ping'] }],
      globalGuards: ['AuthServerGuard'],
      authGuards: ['AuthServerGuard'],
    });

    const route = report.routes[0];
    expect(route?.authentication).toBe('public');
    expect(route?.sessionAuth).toBe(false);
  });

  it('throws when @AuthPublic and @AuthSession are declared on the same handler', () => {
    expect(() =>
      collectRouteAudit({
        controllers: [
          { controller: ContradictionController, methodNames: ['bad'] },
        ],
        globalGuards: ['AuthServerGuard'],
        authGuards: ['AuthServerGuard'],
      }),
    ).toThrow(/declares both @AuthPublic and @AuthSession/);
  });
});

// ── requireSchemaPipe: a `schema` parameter must be reached by a pipe ──

const bodySchema = z.object({ name: z.string() });

@Controller('unpiped')
class UnpipedController {
  @Post()
  create(@Body({ schema: bodySchema }) _body: unknown) {}

  @Get()
  list(
    @Query({ schema: bodySchema }) _query: unknown,
    @Param({ schema: bodySchema }) _params: unknown,
  ) {}

  @Get('plain')
  plain(@Body() _body: unknown) {}
}

@Controller('class-piped')
@UsePipes(new StandardSchemaValidationPipe())
class ClassPipedController {
  @Post()
  create(@Body({ schema: bodySchema }) _body: unknown) {}
}

@Controller('handler-piped')
class HandlerPipedController {
  @Post()
  @UsePipes(StandardSchemaValidationPipe)
  create(@Body({ schema: bodySchema }) _body: unknown) {}
}

@Controller('param-piped')
class ParamPipedController {
  @Post()
  create(
    @Body({ schema: bodySchema, pipes: [new StandardSchemaValidationPipe()] })
    _body: unknown,
  ) {}
}

class OtherPipe {
  transform(value: unknown): unknown {
    return value;
  }
}

@Controller('other-piped')
@UsePipes(new OtherPipe())
class OtherPipedController {
  @Post()
  create(@Body({ schema: bodySchema }) _body: unknown) {}
}

function scan(...controllers: Type<unknown>[]) {
  return collectRouteAudit({
    controllers: controllers.map((controller) => ({
      controller,
      methodNames: Object.getOwnPropertyNames(controller.prototype).filter(
        (name) => name !== 'constructor',
      ),
    })),
    globalGuards: [],
    authGuards: [],
  });
}

describe('collectRouteAudit — unvalidatedSchemaParams', () => {
  it('names every schema parameter that no pipe reaches, in slot order', () => {
    const report = scan(UnpipedController);
    const byHandler = new Map(report.routes.map((r) => [r.handler, r]));
    expect(byHandler.get('create')?.unvalidatedSchemaParams).toEqual(['body']);
    expect(byHandler.get('list')?.unvalidatedSchemaParams).toEqual([
      'query',
      'param',
    ]);
    // No schema declared → nothing to validate against; not reported.
    expect(byHandler.get('plain')?.unvalidatedSchemaParams).toEqual([]);
  });

  it('accepts the pipe at class, handler or parameter level, instance or class', () => {
    for (const controller of [
      ClassPipedController,
      HandlerPipedController,
      ParamPipedController,
    ]) {
      const [route] = scan(controller).routes;
      expect(route.unvalidatedSchemaParams).toEqual([]);
    }
  });

  it('does not count an unrelated pipe', () => {
    const [route] = scan(OtherPipedController).routes;
    expect(route.unvalidatedSchemaParams).toEqual(['body']);
  });
});
