import { describe, expect, it } from 'vitest';
import { Controller } from '@nestjs/common';

import { collectRouteAudit } from './collect-route-audit';
import {
  evaluateRoutePolicy,
  openResponseViolations,
  schemaPipeViolations,
} from './evaluate-route-policy';
import type { RouteAuditReport } from './route-audit.types';

class ProbeController {}

function report(overrides: Partial<RouteAuditReport>): RouteAuditReport {
  return {
    routes: [
      {
        id: 'GET /things',
        method: 'GET',
        path: '/things',
        controller: 'ProbeController',
        controllerRef: ProbeController,
        handler: 'list',
        authentication: 'guarded',
        sessionAuth: false,
        aclAction: null,
        aclResource: null,
        aclQuery: null,
        unvalidatedSchemaParams: [],
        openResponseSchema: null,
        hiddenResponseField: false,
        unvalidatedCrudBody: false,
        unserializedResponseSchemas: [],
      },
    ],
    globalGuards: ['SomeAuthGuard'],
    authGuards: ['SomeAuthGuard'],
    csrfGuards: [],
    ...overrides,
  };
}

/** The same report with its single route marked `@AuthSession()`. */
function sessionReport(overrides: Partial<RouteAuditReport>): RouteAuditReport {
  const base = report(overrides);
  return {
    ...base,
    routes: base.routes.map((route) => ({ ...route, sessionAuth: true })),
  };
}

// `sessionAuth` shipped as a REPORT-ONLY field: nothing read it, so an
// app could decorate every session route `@AuthSession()`, register no
// CsrfGuard, and boot clean serving cookie-authenticated writes with no
// CSRF check anywhere. `requireCsrf` is what closes that.
describe('evaluateRoutePolicy — requireCsrf', () => {
  it('fails a session route when the app registers no CSRF guard', () => {
    const violations = evaluateRoutePolicy(sessionReport({}), {
      requireCsrf: true,
    });
    expect(violations).toEqual([
      expect.objectContaining({ rule: 'requireCsrf', routeId: '*' }),
    ]);
    // The failing routes are still named, or the fix is unlocatable.
    expect(violations[0].detail).toContain('GET /things');
  });

  // One missing global guard is ONE cause. Reporting it per route
  // buries it under repetition — the same reasoning as the
  // unguarded-app short-circuit at the top of the evaluator.
  it('reports the missing guard ONCE, not once per session route', () => {
    const base = report({});
    const many = {
      ...base,
      routes: Array.from({ length: 12 }, (_, i) => ({
        ...base.routes[0],
        id: `POST /thing-${i}`,
        sessionAuth: true,
      })),
    };

    const violations = evaluateRoutePolicy(many, { requireCsrf: true });
    expect(violations).toHaveLength(1);
    expect(violations[0].detail).toContain('12 routes are @AuthSession()');
    expect(violations[0].detail).toContain('+7 more');
  });

  it('passes when a CSRF guard is registered', () => {
    const violations = evaluateRoutePolicy(
      sessionReport({ csrfGuards: ['CsrfGuard'] }),
      { requireCsrf: true },
    );
    expect(violations).toEqual([]);
  });

  it('ignores routes that are not @AuthSession()', () => {
    const violations = evaluateRoutePolicy(report({}), { requireCsrf: true });
    expect(violations).toEqual([]);
  });

  it('does nothing unless the rule is declared', () => {
    const violations = evaluateRoutePolicy(sessionReport({}), {});
    expect(violations).toEqual([]);
  });

  it('honours an `allow` exemption, like every other rule', () => {
    const violations = evaluateRoutePolicy(sessionReport({}), {
      requireCsrf: true,
      allow: ['GET /things'],
    });
    expect(violations).toEqual([]);
  });

  it('participates in the unguarded-app short-circuit', () => {
    const violations = evaluateRoutePolicy(
      sessionReport({ authGuards: [], globalGuards: [] }),
      { requireCsrf: true },
    );
    expect(violations).toEqual([
      expect.objectContaining({ rule: 'requireCsrf', routeId: '*' }),
    ]);
  });
});

describe('evaluateRoutePolicy — the staleAllow gate', () => {
  it('flags a stale allow entry while a rule is declared', () => {
    const violations = evaluateRoutePolicy(report({}), {
      requireAcl: true,
      allow: ['GET /things', 'GET /gone'],
    });
    expect(violations).toEqual([
      expect.objectContaining({ rule: 'staleAllow', routeId: 'GET /gone' }),
    ]);
  });

  // The branch whose whole justification is "the audit must not be the
  // incident": a recognition-only policy enforces nothing, so it must
  // not abort a boot over list hygiene either. Reverting the
  // `declaredRules.length > 0` gate is what this pins.
  it('does NOT flag stale entries when no rule is declared', () => {
    const violations = evaluateRoutePolicy(report({}), {
      allow: ['GET /gone-and-irrelevant'],
    });
    expect(violations).toEqual([]);
  });
});

describe('collectRouteAudit — path arrays', () => {
  it('reports one row per controller-path x handler-path combination', () => {
    // Real decorator metadata, not hand-written keys: the collector must
    // read what Nest actually stamps for `@Controller(['a', 'b'])`.
    @Controller(['alpha', 'beta'])
    class MultiPathController {
      list(): void {}
    }
    Reflect.defineMetadata(
      'path',
      ['x', 'y'],
      MultiPathController.prototype.list,
    );
    Reflect.defineMetadata('method', 0, MultiPathController.prototype.list);

    const { routes } = collectRouteAudit({
      controllers: [{ controller: MultiPathController, methodNames: ['list'] }],
      globalGuards: [],
      authGuards: [],
    });

    expect(routes.map((route) => route.id).sort()).toEqual([
      'GET /alpha/x',
      'GET /alpha/y',
      'GET /beta/x',
      'GET /beta/y',
    ]);
  });
});

describe('schemaPipeViolations (always on)', () => {
  const unpiped = report({
    routes: [
      {
        id: 'POST /things',
        method: 'POST',
        path: '/things',
        controller: 'ProbeController',
        controllerRef: ProbeController,
        handler: 'create',
        authentication: 'guarded',
        sessionAuth: false,
        aclAction: null,
        aclResource: null,
        aclQuery: null,
        unvalidatedSchemaParams: ['body'],
        openResponseSchema: null,
        hiddenResponseField: false,
        unvalidatedCrudBody: false,
        unserializedResponseSchemas: [],
      },
    ],
  });

  it('reports a schema parameter no pipe reaches, with no policy declared', () => {
    const violations = schemaPipeViolations(unpiped);
    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe('requireSchemaPipe');
    expect(violations[0].routeId).toBe('POST /things');
    expect(violations[0].detail).toContain('ProbeController.create: body');
    expect(violations[0].detail).toContain('rocketsSchemaValidation');
  });

  it('is exempted only by its own list, never by allow / allowControllers', () => {
    expect(
      schemaPipeViolations(unpiped, {
        allowUnvalidatedSchema: ['POST /things'],
      }),
    ).toEqual([]);
    // An `allow` written for requireAuth must not switch this check off.
    expect(
      schemaPipeViolations(unpiped, { allow: ['POST /things'] }),
    ).toHaveLength(1);
    expect(
      schemaPipeViolations(unpiped, { allowControllers: [ProbeController] }),
    ).toHaveLength(1);
  });

  it('reports a hidden field in @SerializeOptions({ schema }) as requireClosedResponse', () => {
    const base = report({});
    const hidden: RouteAuditReport = {
      ...base,
      routes: base.routes.map((route) => ({
        ...route,
        hiddenResponseField: true,
      })),
    };
    const violations = openResponseViolations(hidden);
    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe('requireClosedResponse');
    expect(violations[0].detail).toContain('dto: { response: false }');
  });

  it('reports an open @SerializeOptions({ schema }) as requireClosedResponse', () => {
    const base = report({});
    const open: RouteAuditReport = {
      ...base,
      routes: base.routes.map((route) => ({
        ...route,
        openResponseSchema: '$.items[]',
      })),
    };
    const violations = openResponseViolations(open);
    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe('requireClosedResponse');
    expect(violations[0].detail).toContain('"$.items[]"');
    expect(openResponseViolations(report({}))).toEqual([]);
  });

  it('reports a generated CRUD body with no schema (controller-level body)', () => {
    const base = report({});
    const crud: RouteAuditReport = {
      ...base,
      routes: base.routes.map((route) => ({
        ...route,
        id: 'PATCH /things/:id',
        method: 'PATCH',
        handler: 'update',
        unvalidatedCrudBody: true,
      })),
    };
    const violations = schemaPipeViolations(crud);
    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe('requireSchemaPipe');
    expect(violations[0].detail).toContain('OPERATION-level');
    expect(
      schemaPipeViolations(crud, {
        allowUnvalidatedSchema: ['PATCH /things/:id'],
      }),
    ).toEqual([]);
  });

  it('rejects an allowUnvalidatedSchema entry that matches more than one route', () => {
    const [only] = unpiped.routes;
    const doubled: RouteAuditReport = { ...unpiped, routes: [only, only] };
    const violations = schemaPipeViolations(doubled, {
      allowUnvalidatedSchema: ['POST /things'],
    });
    expect(violations.map((v) => v.rule)).toEqual(['staleAllow']);
    expect(violations[0].detail).toContain('MORE THAN ONE');
  });

  it('is silent on a validated route', () => {
    expect(schemaPipeViolations(report({}))).toEqual([]);
  });
});
