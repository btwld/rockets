/**
 * The audit exists because every serious defect in this package's
 * history was green and wrong: a `ctx` omission that disabled all hooks
 * (#45), a forgotten grant that leaves a route authenticated but open
 * (#51), a response DTO that silently emptied a column (#68). None of
 * them failed a build, a lint or a test.
 *
 * These tests therefore assert on the two things a report must never
 * get wrong: that it does not claim a route is protected when it is
 * not, and that turning a rule on actually stops the boot.
 */
import { describe, expect, it } from 'vitest';
import {
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  Post,
  Scope,
  SerializeOptions,
  StandardSchemaValidationPipe,
  type Provider,
  type Type,
  UsePipes,
} from '@nestjs/common';
import { APP_GUARD, DiscoveryModule } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import {
  AccessControlGrant,
  AccessControlQuery,
  type CanAccess,
} from '@concepta/nestjs-access-control';
import { ActionEnum, withOpenApi } from '@concepta/nestjs-core';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { AuthPublic } from '../decorators/auth-public.decorator';
import { AccessControl } from 'accesscontrol';
import type { ExecutionContext } from '@nestjs/common';
import type { AccessControlServiceInterface } from '@concepta/nestjs-access-control';
import { z } from 'zod';
import { f } from '../zod/fields';
import { operationResource } from '../zod';
import { RocketsCoreModule } from '../rockets-core.module';
import { defineAuthAdapter } from '../infrastructure/auth/define-auth-adapter';
import type {
  AuthAdapterInterface,
  AuthAttemptResult,
} from '../domain/interfaces/auth-adapter.interface';
import {
  RouteAuditService,
  type RouteAuditReport,
  ROCKETS_ROUTE_POLICY_TOKEN,
  type RoutePolicy,
} from '../infrastructure/audit';
import { AuthSession } from '../decorators/auth-session.decorator';
import { CsrfGuard } from '../infrastructure/guards/csrf.guard';
import { CSRF_GUARD_OPTIONS_TOKEN } from '../rockets-core.constants';
import { rocketsSchemaValidation } from '../common/utils/standard-schema.util';

@Injectable()
class AllowAllGuard {
  canActivate(): boolean {
    return true;
  }
}

/** Request-scoped: Nest routes these to `injectables`, not `providers`. */
@Injectable({ scope: Scope.REQUEST })
class RequestScopedAuthGuard {
  canActivate(): boolean {
    return true;
  }
}

@Controller('status')
@ApiTags('Status')
@AuthPublic({ classLevel: true })
class StatusController {
  @Get()
  @ApiOkResponse({ description: 'Class-level public probe' })
  check(): void {}
}

@Injectable()
class InvoiceCanAccess {
  async canAccess(): Promise<boolean> {
    return true;
  }
}

@Controller('invoices')
@ApiTags('Invoices')
class InvoiceController {
  @Get()
  @ApiOkResponse({ description: 'List invoices' })
  @AccessControlGrant({ action: ActionEnum.READ, resource: 'invoice' })
  @AccessControlQuery({
    service: InvoiceCanAccess as unknown as new () => CanAccess,
  })
  list(): void {}

  /** Granted, but no CanAccess: `own` cannot be resolved. */
  @Post()
  @ApiOkResponse({ description: 'Create invoice' })
  @AccessControlGrant({ action: ActionEnum.CREATE, resource: 'invoice' })
  create(): void {}

  /** Authenticated and ungranted — the #51 failure shape. */
  @Get('summary')
  @ApiOkResponse({ description: 'Invoice summary' })
  summary(): void {}
}

@Controller('health')
@ApiTags('Health')
class HealthController {
  @Get()
  @ApiOkResponse({ description: 'Liveness probe' })
  @AuthPublic()
  check(): void {}
}

async function boot(args: {
  readonly withGuard: boolean;
  readonly policy?: RoutePolicy;
}) {
  // `AllowAllGuard` stands in for an integration-owned auth guard, so
  // policies must recognise it explicitly — which also exercises the
  // `authGuards` escape hatch on every policy-carrying test.
  const policy: RoutePolicy | undefined = args.policy
    ? { authGuards: [AllowAllGuard], ...args.policy }
    : args.policy;
  @Module({
    imports: [DiscoveryModule],
    controllers: [InvoiceController, HealthController],
    providers: [
      RouteAuditService,
      InvoiceCanAccess,
      ...(args.withGuard
        ? [{ provide: APP_GUARD, useClass: AllowAllGuard }]
        : []),
      ...(policy
        ? [{ provide: ROCKETS_ROUTE_POLICY_TOKEN, useValue: policy }]
        : []),
    ],
  })
  class TestModule {}

  const moduleRef = await Test.createTestingModule({
    imports: [TestModule],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

describe('route audit + policy (e2e)', () => {
  it('reports what is enforced on every discovered route', async () => {
    const app = await boot({ withGuard: true });
    const report = app.get(RouteAuditService).audit();
    await app.close();

    expect(report.globalGuards).toEqual(['AllowAllGuard']);
    // No policy declared -> nothing recognises AllowAllGuard as
    // authentication, and the report must NOT claim guarded routes.
    expect(report.authGuards).toEqual([]);

    const byId = Object.fromEntries(report.routes.map((r) => [r.id, r]));

    // Unrecognised guard -> the report refuses to call anything guarded.
    expect(byId['GET /invoices']).toMatchObject({
      authentication: 'unguarded-app',
      aclAction: ActionEnum.READ,
      aclResource: 'invoice',
      aclQuery: 'InvoiceCanAccess',
    });
    expect(byId['POST /invoices']).toMatchObject({
      authentication: 'unguarded-app',
      aclAction: ActionEnum.CREATE,
      aclQuery: null,
    });
    expect(byId['GET /health']).toMatchObject({ authentication: 'public' });
  });

  it('reports guarded once the policy recognises the guard', async () => {
    const app = await boot({
      withGuard: true,
      policy: {
        // No rules — recognition only. Declaring a rule would abort the
        // boot on the deliberately ungranted fixtures.
      },
    });
    const report = app.get(RouteAuditService).audit();
    await app.close();

    expect(report.authGuards).toEqual(['AllowAllGuard']);
    const byId = Object.fromEntries(report.routes.map((r) => [r.id, r]));
    expect(byId['GET /invoices']).toMatchObject({ authentication: 'guarded' });
    expect(byId['GET /invoices/summary']).toMatchObject({
      authentication: 'guarded',
      aclAction: null,
    });
  });

  // The report must not inherit the app's optimism. With no global guard
  // nothing authenticates anything, and calling those routes `guarded`
  // would be the exact lie this module exists to prevent.
  it('never reports a route as guarded when the app has no global guard', async () => {
    const app = await boot({ withGuard: false });
    const report = app.get(RouteAuditService).audit();
    await app.close();

    expect(report.globalGuards).toEqual([]);
    expect(report.routes.every((r) => r.authentication !== 'guarded')).toBe(
      true,
    );
    expect(
      report.routes.filter((r) => r.authentication === 'unguarded-app').length,
    ).toBe(3);
    // An explicit AuthPublic is still the author's intent, not a symptom.
    expect(
      report.routes.find((r) => r.id === 'GET /health')?.authentication,
    ).toBe('public');
  });

  it('fails the boot when an authenticated route carries no grant', async () => {
    await expect(
      boot({ withGuard: true, policy: { requireAcl: true } }),
    ).rejects.toThrow(/GET \/invoices\/summary[\s\S]*no AccessControlGrant/);
  });

  it('fails the boot when a grant cannot resolve own possession', async () => {
    await expect(
      boot({ withGuard: true, policy: { requireAclQuery: true } }),
    ).rejects.toThrow(/POST \/invoices[\s\S]*no CanAccess service/);
  });

  it('reports the app-wide cause exactly once, not per route', async () => {
    const error = await boot({
      withGuard: false,
      policy: { requireAuth: true, requireAcl: true },
    }).catch((caught: unknown) => caught);

    const message = error instanceof Error ? error.message : String(error);
    expect(message).toMatch(/registers no global guard/);
    // Three routes exist; repeating one app-wide cause on each buries it.
    expect(message.match(/registers no global guard/g)).toHaveLength(1);
    expect(message).toMatch(/rejected 1 route:/);
  });

  // The hole this closes: `requireAcl` gates on `authentication ===
  // 'guarded'`, so on an app with no global guard NOTHING is guarded and
  // the rule silently never fires. Declaring a rule and getting a clean
  // boot with zero enforcement is the exact failure this module exists
  // to prevent, committed by the module itself.
  it('does not go quiet when a rule is declared and the app is unguarded', async () => {
    await expect(
      boot({ withGuard: false, policy: { requireAcl: true } }),
    ).rejects.toThrow(/no global guard/);
  });

  it('boots when every finding is explicitly allowed', async () => {
    const app = await boot({
      withGuard: true,
      policy: {
        requireAuth: true,
        requireAcl: true,
        requireAclQuery: true,
        allow: ['GET /health', 'GET /invoices/summary', 'POST /invoices'],
      },
    });
    expect(app).toBeDefined();
    await app.close();
  });

  it('exempts a whole controller the app does not own', async () => {
    const app = await boot({
      withGuard: true,
      policy: {
        requireAuth: true,
        requireAcl: true,
        requireAclQuery: true,
        allowControllers: [HealthController],
        allow: ['GET /invoices/summary', 'POST /invoices'],
      },
    });
    expect(app).toBeDefined();
    await app.close();
  });
});

// ── Wiring through RocketsCoreModule itself ──
//
// The pure functions and the standalone service are covered above; this
// proves the `routePolicy` option actually reaches them, including the
// DiscoveryModule import the service depends on. A feature that works
// only when hand-wired is not the feature that was shipped.

@Injectable()
class NoopAuthAdapter implements AuthAdapterInterface {
  async authenticate(): Promise<AuthAttemptResult> {
    return { matched: false };
  }
}

// ── The two guard shapes the first revision judged wrong ──

describe('guard classification (e2e)', () => {
  const bootWith = async (args: {
    readonly providers: Provider[];
    readonly policy: RoutePolicy;
    readonly controllers?: Type<unknown>[];
  }) => {
    @Module({
      imports: [DiscoveryModule],
      controllers: args.controllers ?? [InvoiceController, HealthController],
      providers: [
        RouteAuditService,
        InvoiceCanAccess,
        { provide: ROCKETS_ROUTE_POLICY_TOKEN, useValue: args.policy },
        ...args.providers,
      ],
    })
    class TestModule {}
    const moduleRef = await Test.createTestingModule({
      imports: [TestModule],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    return app;
  };

  // Upstream access-control registers an APP_GUARD factory
  // unconditionally and resolves it to `null` when `appGuard: false`.
  // The first revision counted the WRAPPER: an app with zero
  // authentication reported every route as guarded and `requireAuth`
  // booted green. The exact configuration is any factory resolving to
  // null — reproduced here without dragging the ACL module in.
  it('a factory guard resolving to null is not authentication', async () => {
    await expect(
      bootWith({
        providers: [{ provide: APP_GUARD, useFactory: () => null }],
        policy: { requireAuth: true },
      }),
    ).rejects.toThrow(/no global guard/);
  });

  // A recognised-but-non-auth guard: present, resolved, and still not
  // authentication. The failure message must say the guards were seen.
  it('a non-auth global guard does not satisfy requireAuth', async () => {
    await expect(
      bootWith({
        providers: [{ provide: APP_GUARD, useClass: AllowAllGuard }],
        policy: { requireAuth: true },
      }),
    ).rejects.toThrow(/none is recognised as an AUTHENTICATION guard/);
  });

  // Request-scoped guards live in `injectables`, invisible to
  // DiscoveryService.getProviders() — the first revision hard-failed
  // this correctly guarded app.
  it('a request-scoped auth guard is seen and satisfies requireAuth', async () => {
    const app = await bootWith({
      providers: [{ provide: APP_GUARD, useClass: RequestScopedAuthGuard }],
      policy: {
        requireAuth: true,
        authGuards: [RequestScopedAuthGuard],
        allow: ['GET /health'],
      },
    });
    const report = app.get(RouteAuditService).audit();
    expect(report.authGuards).toEqual(['RequestScopedAuthGuard']);
    await app.close();
  });

  it('classifies class-level AuthPublic and reports it distinctly', async () => {
    const app = await bootWith({
      providers: [{ provide: APP_GUARD, useClass: AllowAllGuard }],
      policy: { authGuards: [AllowAllGuard] },
      controllers: [InvoiceController, StatusController],
    });
    const report = app.get(RouteAuditService).audit();
    await app.close();
    expect(
      report.routes.find((r) => r.id === 'GET /status')?.authentication,
    ).toBe('public-class');
  });

  // Review round 4: a public v1 and a guarded v2 of the same
  // METHOD+path are different wire routes; one unqualified id collapsed
  // them and a single allow entry exempted BOTH.
  it('qualifies route ids by version, so allow cannot widen across versions', async () => {
    @Controller({ path: 'widgets', version: '1' })
    @ApiTags('WidgetsV1')
    @AuthPublic({ classLevel: true })
    class WidgetsV1Controller {
      @Get()
      @ApiOkResponse({ description: 'v1 public' })
      list(): void {}
    }
    @Controller({ path: 'widgets', version: '2' })
    @ApiTags('WidgetsV2')
    class WidgetsV2Controller {
      @Get()
      @ApiOkResponse({ description: 'v2 guarded' })
      list(): void {}
    }

    const app = await bootWith({
      providers: [{ provide: APP_GUARD, useClass: AllowAllGuard }],
      policy: { authGuards: [AllowAllGuard] },
      controllers: [WidgetsV1Controller, WidgetsV2Controller],
    });
    const report = app.get(RouteAuditService).audit();
    await app.close();

    const ids = report.routes.map((r) => r.id).sort();
    expect(ids).toEqual(['GET /widgets [v1]', 'GET /widgets [v2]']);

    // The unqualified id matches NOTHING now — loud, not silently wide.
    await expect(
      bootWith({
        providers: [{ provide: APP_GUARD, useClass: AllowAllGuard }],
        policy: {
          requireAuth: true,
          authGuards: [AllowAllGuard],
          allow: ['GET /widgets'],
        },
        controllers: [WidgetsV1Controller, WidgetsV2Controller],
      }),
    ).rejects.toThrow(/staleAllow/);

    // The qualified id exempts exactly the public v1; the guarded v2
    // stays enforced and the app boots.
    const ok = await bootWith({
      providers: [{ provide: APP_GUARD, useClass: AllowAllGuard }],
      policy: {
        requireAuth: true,
        authGuards: [AllowAllGuard],
        allow: ['GET /widgets [v1]', 'GET /health'],
      },
      controllers: [WidgetsV1Controller, WidgetsV2Controller, HealthController],
    });
    await ok.close();
  });

  it('fails closed when one allow id still matches more than one route', async () => {
    @Controller('twins')
    @ApiTags('TwinsA')
    class TwinAController {
      @Get()
      @ApiOkResponse({ description: 'twin a' })
      list(): void {}
    }
    @Controller('twins')
    @ApiTags('TwinsB')
    class TwinBController {
      @Get()
      @ApiOkResponse({ description: 'twin b' })
      list(): void {}
    }

    await expect(
      bootWith({
        providers: [{ provide: APP_GUARD, useClass: AllowAllGuard }],
        policy: {
          requireAuth: true,
          authGuards: [AllowAllGuard],
          allow: ['GET /twins', 'GET /health'],
        },
        controllers: [TwinAController, TwinBController, HealthController],
      }),
    ).rejects.toThrow(/MORE THAN ONE discovered route/);
  });

  // An allow list that can rot silently stops meaning anything.
  // Upstream enforces AccessControlQuery via getAllAndMerge([class,
  // handler]) — a CLASS-level query is real enforcement. Auditing only
  // the handler reported it null and requireAclQuery aborted a
  // correctly-enforced app.
  it('recognises a class-level AccessControlQuery', async () => {
    @Controller('class-query')
    @ApiTags('ClassQuery')
    @AccessControlQuery({
      service: InvoiceCanAccess as unknown as Type<CanAccess>,
    })
    class ClassQueryController {
      @Get()
      @ApiOkResponse({ description: 'probe' })
      @AccessControlGrant({ action: ActionEnum.READ, resource: 'invoice' })
      list(): void {}
    }

    const app = await bootWith({
      providers: [{ provide: APP_GUARD, useClass: AllowAllGuard }],
      policy: { requireAclQuery: true, authGuards: [AllowAllGuard] },
      controllers: [ClassQueryController],
    });
    const report = app.get(RouteAuditService).audit();
    await app.close();
    expect(
      report.routes.find((r) => r.id === 'GET /class-query')?.aclQuery,
    ).toBe('InvoiceCanAccess');
  });

  it('fails the boot on a stale allow entry', async () => {
    await expect(
      bootWith({
        providers: [{ provide: APP_GUARD, useClass: AllowAllGuard }],
        policy: {
          requireAuth: true,
          authGuards: [AllowAllGuard],
          allow: ['GET /health', 'GET /no-such-route'],
        },
      }),
    ).rejects.toThrow(/staleAllow.*GET \/no-such-route/);
  });
});

describe('routePolicy through RocketsCoreModule (e2e)', () => {
  const bootCore = async (policy?: RoutePolicy) => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        RocketsCoreModule.forRoot({
          auth: defineAuthAdapter(NoopAuthAdapter),
          providers: [NoopAuthAdapter],
          ...(policy
            ? { routePolicy: { authGuards: [AllowAllGuard], ...policy } }
            : {}),
        }),
      ],
      controllers: [InvoiceController],
      providers: [
        InvoiceCanAccess,
        { provide: APP_GUARD, useClass: AllowAllGuard },
      ],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    return app;
  };

  it('rejects the boot when a declared rule is violated', async () => {
    await expect(bootCore({ requireAcl: true })).rejects.toThrow(
      /GET \/invoices\/summary/,
    );
  });

  it('boots and exposes the report when no policy is declared', async () => {
    const app = await bootCore();
    // No policy means no policy enforcement — but the service is always
    // registered (its schema-pipe check needs no policy), so the report
    // is available without declaring one.
    const report = app.get(RouteAuditService).audit();
    expect(report.routes.map((r) => r.id)).toContain('GET /invoices');
    await app.close();
  });

  // Round 4: registered-but-unexported satisfies `app.get()` and fails
  // real DI — a consumer module's `inject: [RouteAuditService]` could
  // not resolve, though the docs promise injection.
  it('is injectable from a CONSUMER module factory, not only app.get', async () => {
    const AUDIT_PROBE = Symbol('AUDIT_PROBE');

    @Module({
      providers: [
        {
          provide: AUDIT_PROBE,
          inject: [RouteAuditService],
          // Injection is the thing under test; the report is read AFTER
          // init (global guards are not resolved at factory time).
          useFactory: (audit: RouteAuditService) => () => audit.audit(),
        },
      ],
    })
    class ConsumerModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [
        RocketsCoreModule.forRoot({
          auth: defineAuthAdapter(NoopAuthAdapter),
          providers: [NoopAuthAdapter],
          routePolicy: { authGuards: [AllowAllGuard] },
          global: true,
        }),
        ConsumerModule,
      ],
      controllers: [HealthController],
      providers: [{ provide: APP_GUARD, useClass: AllowAllGuard }],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    const probe = app.get<() => RouteAuditReport>(AUDIT_PROBE);
    const report = probe();
    await app.close();
    expect(report).toMatchObject({ authGuards: ['AllowAllGuard'] });
  });

  it('boots when the policy is satisfied, and the report is injectable', async () => {
    const app = await bootCore({
      requireAcl: true,
      allow: ['GET /invoices/summary'],
    });
    const report = app.get(RouteAuditService).audit();
    expect(report.routes.some((r) => r.id === 'GET /invoices')).toBe(true);
    await app.close();
  });
});

// ── A GENERATED controller, not a hand-written fixture ──
//
// The audit's stated audience is planner-generated surface; every case
// above uses hand-written controllers. This wires an `operationResource`
// with `acl` through `RocketsCoreModule` and asserts the audit reads the
// grants Rockets itself stamped.

const auditAcRules = new AccessControl();
auditAcRules.grant('user').resource('gizmo').updateAny().readAny();

class AuditAcService implements AccessControlServiceInterface {
  async getUser(context: ExecutionContext): Promise<unknown> {
    return context.switchToHttp().getRequest().user;
  }
  async getUserRoles(): Promise<string[]> {
    return ['user'];
  }
}

const gizmoOps = operationResource({
  path: 'gizmos',
  tags: ['Gizmos'],
  acl: { resource: 'gizmo' },
  operations: (op) => ({
    relabel: op.write({
      acl: 'update',
      input: z.object({ label: z.string() }),
      output: z.object({ ok: z.boolean() }),
      handler: () => ({ ok: true }),
    }),
    peek: op.read({
      // Deliberately ungranted: must surface as the requireAcl finding.
      acl: false,
      output: z.object({ seen: z.boolean() }),
      handler: () => ({ seen: true }),
    }),
  }),
});

describe('routePolicy over a generated operation resource (e2e)', () => {
  it('reads the grants Rockets stamped on its own generated controller', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        RocketsCoreModule.forRoot({
          auth: defineAuthAdapter(NoopAuthAdapter),
          providers: [NoopAuthAdapter],
          resources: [gizmoOps],
          accessControl: {
            service: new AuditAcService(),
            settings: { rules: auditAcRules },
            appFilter: false,
            appGuard: false,
          },
          routePolicy: { authGuards: [AllowAllGuard] },
          global: true,
        }),
      ],
      providers: [{ provide: APP_GUARD, useClass: AllowAllGuard }],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    const report = app.get(RouteAuditService).audit();
    await app.close();

    // The ACL module registers an APP_GUARD factory unconditionally;
    // with `appGuard: false` it resolves to null and must NOT appear.
    // Asserted on globalGuards EQUALITY, not just authGuards: a counted
    // null wrapper would never classify as auth, so the weaker
    // assertion survives the exact wrapper-counting bug this pins.
    expect(report.globalGuards).toEqual(['AllowAllGuard']);
    expect(report.authGuards).toEqual(['AllowAllGuard']);

    const byId = Object.fromEntries(report.routes.map((r) => [r.id, r]));
    expect(byId['POST /gizmos/relabel']).toMatchObject({
      authentication: 'guarded',
      aclAction: 'update',
      aclResource: 'gizmo',
    });
    // `acl: false` is a recorded opt-out: no grant metadata on the route.
    expect(byId['GET /gizmos/peek']).toMatchObject({
      authentication: 'guarded',
      aclAction: null,
    });
  });
});

/**
 * `requireCsrf` — the rule that makes `@AuthSession()` mean something.
 *
 * `sessionAuth` shipped as a report-only field, so an app could decorate
 * every cookie-authenticated write `@AuthSession()`, register no
 * `CsrfGuard`, and boot perfectly clean while serving those writes with
 * no CSRF check anywhere. The decorator is inert metadata until a guard
 * reads it, and nothing verified a guard existed.
 *
 * Booted for real rather than unit-tested because the whole question is
 * whether the guard is registered in the RUNNING app, and because
 * recognition is by class identity — a hand-built report cannot fail the
 * way a real `ApplicationConfig` sweep can.
 */
describe('route policy — requireCsrf (e2e)', () => {
  @Controller('sessions')
  @ApiTags('Sessions')
  class SessionWriteController {
    @Post()
    @ApiOkResponse({ description: 'Cookie-authenticated write' })
    @AuthSession()
    save(): void {}
  }

  const csrfOptions = {
    secret: 'route-audit-csrf-secret-0123456789abcdef',
    sessionCookieName: '__session',
  };

  async function bootCsrf(args: {
    readonly withCsrfGuard: boolean;
    readonly policy?: RoutePolicy;
  }) {
    const policy: RoutePolicy | undefined = args.policy
      ? { authGuards: [AllowAllGuard], ...args.policy }
      : args.policy;

    @Module({
      imports: [DiscoveryModule],
      controllers: [SessionWriteController],
      providers: [
        RouteAuditService,
        { provide: APP_GUARD, useClass: AllowAllGuard },
        ...(args.withCsrfGuard
          ? [
              { provide: APP_GUARD, useClass: CsrfGuard },
              { provide: CSRF_GUARD_OPTIONS_TOKEN, useValue: csrfOptions },
            ]
          : []),
        ...(policy
          ? [{ provide: ROCKETS_ROUTE_POLICY_TOKEN, useValue: policy }]
          : []),
      ],
    })
    class CsrfTestModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [CsrfTestModule],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    return app;
  }

  it('reports sessionAuth and recognises a registered CsrfGuard', async () => {
    const app = await bootCsrf({ withCsrfGuard: true, policy: {} });
    const report = app.get(RouteAuditService).audit();
    await app.close();

    expect(report.csrfGuards).toEqual(['CsrfGuard']);
    const byId = Object.fromEntries(report.routes.map((r) => [r.id, r]));
    expect(byId['POST /sessions']).toMatchObject({ sessionAuth: true });
  });

  it('reports no CSRF guard when none is registered', async () => {
    const app = await bootCsrf({ withCsrfGuard: false, policy: {} });
    const report = app.get(RouteAuditService).audit();
    await app.close();

    expect(report.csrfGuards).toEqual([]);
  });

  // The falsifying case: this boot MUST fail. Before `requireCsrf`
  // existed it succeeded, and the app served unprotected cookie writes.
  it('fails the boot on an @AuthSession() route with no CSRF guard', async () => {
    await expect(
      bootCsrf({ withCsrfGuard: false, policy: { requireCsrf: true } }),
    ).rejects.toThrow(/requireCsrf/);
  });

  it('boots when the CSRF guard is registered', async () => {
    const app = await bootCsrf({
      withCsrfGuard: true,
      policy: { requireCsrf: true },
    });
    expect(app.get(RouteAuditService).audit().csrfGuards).toEqual([
      'CsrfGuard',
    ]);
    await app.close();
  });

  // Without the rule declared the same app boots — the opt-in shape
  // §7c now documents honestly, rather than as always-on protection.
  it('boots without the rule declared, even with no CSRF guard', async () => {
    const app = await bootCsrf({ withCsrfGuard: false, policy: {} });
    await app.close();
  });

  // `@AuthSession({ classLevel: true })` stores the `'classLevel'`
  // sentinel rather than `true`, the same shape `AuthPublic` uses. Both
  // `collectRouteAudit`'s `isSession` and `CsrfGuard` test for it — if
  // either tested only `=== true`, class-level session routes would be
  // invisible to `requireCsrf` and silently unprotected.
  it('fails the boot for a CLASS-level @AuthSession() controller too', async () => {
    @Controller('bulk-sessions')
    @ApiTags('Sessions')
    @AuthSession({ classLevel: true })
    class ClassLevelSessionController {
      @Post()
      @ApiOkResponse({ description: 'Cookie-authenticated write' })
      save(): void {}
    }

    async function bootClassLevel(withCsrfGuard: boolean) {
      @Module({
        imports: [DiscoveryModule],
        controllers: [ClassLevelSessionController],
        providers: [
          RouteAuditService,
          { provide: APP_GUARD, useClass: AllowAllGuard },
          ...(withCsrfGuard
            ? [
                { provide: APP_GUARD, useClass: CsrfGuard },
                { provide: CSRF_GUARD_OPTIONS_TOKEN, useValue: csrfOptions },
              ]
            : []),
          {
            provide: ROCKETS_ROUTE_POLICY_TOKEN,
            useValue: {
              authGuards: [AllowAllGuard],
              requireCsrf: true,
            } satisfies RoutePolicy,
          },
        ],
      })
      class ClassLevelModule {}

      const moduleRef = await Test.createTestingModule({
        imports: [ClassLevelModule],
      }).compile();
      const app = moduleRef.createNestApplication();
      await app.init();
      return app;
    }

    await expect(bootClassLevel(false)).rejects.toThrow(/requireCsrf/);

    const app = await bootClassLevel(true);
    const byId = Object.fromEntries(
      app
        .get(RouteAuditService)
        .audit()
        .routes.map((r) => [r.id, r]),
    );
    expect(byId['POST /bulk-sessions']).toMatchObject({ sessionAuth: true });
    await app.close();
  });

  // Request-scoped guards live in `getGlobalRequestGuards()` and are
  // classified by prototype chain, not `instanceof` — a separate branch
  // from the singleton one every other test here exercises.
  it('recognises a request-scoped CSRF guard', async () => {
    @Injectable({ scope: Scope.REQUEST })
    class RequestScopedCsrfGuard extends CsrfGuard {}

    @Module({
      imports: [DiscoveryModule],
      controllers: [SessionWriteController],
      providers: [
        RouteAuditService,
        { provide: APP_GUARD, useClass: AllowAllGuard },
        { provide: APP_GUARD, useClass: RequestScopedCsrfGuard },
        { provide: CSRF_GUARD_OPTIONS_TOKEN, useValue: csrfOptions },
        {
          provide: ROCKETS_ROUTE_POLICY_TOKEN,
          useValue: {
            authGuards: [AllowAllGuard],
            requireCsrf: true,
          } satisfies RoutePolicy,
        },
      ],
    })
    class RequestScopedModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [RequestScopedModule],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    // Boots (the rule is satisfied) AND the subclass is recognised.
    expect(app.get(RouteAuditService).audit().csrfGuards).toEqual([
      'RequestScopedCsrfGuard',
    ]);
    await app.close();
  });

  it('recognises an app-owned CSRF guard named in the policy', async () => {
    @Injectable()
    class HomegrownCsrfGuard {
      canActivate(): boolean {
        return true;
      }
    }

    @Module({
      imports: [DiscoveryModule],
      controllers: [SessionWriteController],
      providers: [
        RouteAuditService,
        { provide: APP_GUARD, useClass: AllowAllGuard },
        { provide: APP_GUARD, useClass: HomegrownCsrfGuard },
        {
          provide: ROCKETS_ROUTE_POLICY_TOKEN,
          useValue: {
            authGuards: [AllowAllGuard],
            csrfGuards: [HomegrownCsrfGuard],
            requireCsrf: true,
          } satisfies RoutePolicy,
        },
      ],
    })
    class HomegrownModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [HomegrownModule],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    expect(app.get(RouteAuditService).audit().csrfGuards).toEqual([
      'HomegrownCsrfGuard',
    ]);
    await app.close();
  });
});

// ── requireSchemaPipe: always on, no policy needed ──
//
// `@Body({ schema })` without a StandardSchemaValidationPipe documents the
// body in OpenAPI and validates nothing — Nest installs no pipe for
// `schema`. The audit catches it at boot in EVERY app, policy or not.

const noteSchema = z.object({ text: z.string() });

@Controller('notes-unpiped')
@ApiTags('Notes')
class UnpipedNotesController {
  @Post()
  @ApiOkResponse({ description: 'Unvalidated body probe' })
  create(@Body({ schema: noteSchema }) body: unknown): unknown {
    return body;
  }
}

@Controller('notes-piped')
@ApiTags('Notes')
@UsePipes(new StandardSchemaValidationPipe(rocketsSchemaValidation))
class PipedNotesController {
  @Post()
  @ApiOkResponse({ description: 'Validated body probe' })
  create(@Body({ schema: noteSchema }) body: unknown): unknown {
    return body;
  }
}

const openNotesResponse = withOpenApi(
  z.object({ items: z.array(z.looseObject({ text: z.string() })) }),
  'OpenNotesResponseDto',
);
const closedNotesResponse = withOpenApi(
  z.object({ items: z.array(z.object({ text: z.string() })) }),
  'ClosedNotesResponseDto',
);

@Controller('notes-open-response')
@ApiTags('Notes')
class OpenResponseNotesController {
  @Get()
  @SerializeOptions({ schema: openNotesResponse })
  @ApiOkResponse({ standardSchema: openNotesResponse })
  list(): unknown {
    return { items: [] };
  }
}

const hiddenNotesResponse = withOpenApi(
  z.object({
    items: z.array(
      z.object({
        text: z.string(),
        secret: f.string({ dto: { response: false } }),
      }),
    ),
  }),
  'HiddenNotesResponseDto',
);

@Controller('notes-hidden-response')
@ApiTags('Notes')
class HiddenResponseNotesController {
  @Get()
  @SerializeOptions({ schema: hiddenNotesResponse })
  @ApiOkResponse({ standardSchema: hiddenNotesResponse })
  list(): unknown {
    return { items: [] };
  }
}

@Controller('notes-closed-response')
@ApiTags('Notes')
@SerializeOptions({ schema: closedNotesResponse })
class ClosedResponseNotesController {
  @Get()
  @ApiOkResponse({ standardSchema: closedNotesResponse })
  list(): unknown {
    return { items: [] };
  }
}

describe('requireSchemaPipe through RocketsCoreModule (e2e)', () => {
  const bootCoreWith = async (
    controller: Type<unknown>,
    policy?: RoutePolicy,
  ) => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        RocketsCoreModule.forRoot({
          auth: defineAuthAdapter(NoopAuthAdapter),
          providers: [NoopAuthAdapter],
          ...(policy ? { routePolicy: policy } : {}),
        }),
      ],
      controllers: [controller],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    return app;
  };

  it('rejects the boot when a schema parameter is reached by no pipe (no policy declared)', async () => {
    await expect(bootCoreWith(UnpipedNotesController)).rejects.toThrow(
      /requireSchemaPipe\] POST \/notes-unpiped: UnpipedNotesController\.create: body declares a schema/,
    );
  });

  it('boots the same route once a class-level StandardSchemaValidationPipe is present', async () => {
    const app = await bootCoreWith(PipedNotesController);
    const [route] = app
      .get(RouteAuditService)
      .audit()
      .routes.filter((r) => r.controller === 'PipedNotesController');
    expect(route.unvalidatedSchemaParams).toEqual([]);
    await app.close();
  });

  it('is exempted only by allowUnvalidatedSchema — allow / allowControllers do not switch it off', async () => {
    await expect(
      bootCoreWith(UnpipedNotesController, {
        allowControllers: [UnpipedNotesController],
      }),
    ).rejects.toThrow(/requireSchemaPipe/);
    const app = await bootCoreWith(UnpipedNotesController, {
      allowUnvalidatedSchema: ['POST /notes-unpiped'],
    });
    await app.close();
  });

  // Serialization IS validation for a hand-written route: an open object
  // in its @SerializeOptions schema ships whatever the row carries.
  it('rejects a hand-written @SerializeOptions({ schema }) with a hidden field', async () => {
    await expect(bootCoreWith(HiddenResponseNotesController)).rejects.toThrow(
      /requireClosedResponse\] GET \/notes-hidden-response: HiddenResponseNotesController\.list: @SerializeOptions\({ schema }\) contains a field declared/,
    );
  });

  it('rejects a hand-written @SerializeOptions({ schema }) with an open object', async () => {
    await expect(bootCoreWith(OpenResponseNotesController)).rejects.toThrow(
      /requireClosedResponse\] GET \/notes-open-response: OpenResponseNotesController\.list: @SerializeOptions\({ schema }\) is open at "\$\.items\[\]"/,
    );
    const app = await bootCoreWith(ClosedResponseNotesController);
    await app.close();
  });
});
