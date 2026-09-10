/**
 * `routePolicy` forwarded through `RocketsModule` — the composition path
 * the core README advertises coverage for, and the one where
 * package-owned controllers (the `/me` controller) actually exist.
 *
 * `AuthServerGuard` is what this module registers as the global guard,
 * and the audit recognises it as authentication WITHOUT `authGuards` —
 * that recognition is the load-bearing half of these tests.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { INestApplication, Injectable } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { RouteAuditService } from '@concepta/rockets-core';

import { E2eFakeRepositoryModule } from './__e2e__/helpers/e2e-fake-repository.module';
import { ServerAuthAdapterFixture } from './__fixtures__/providers/server-auth.adapter.fixture';
import type { RocketsOptions } from './rockets.module-definition';
import { userMetadataConfigFixture } from './__fixtures__/schemas/user-metadata.schema.fixture';
import { buildMeController } from './gateways/http/build-me-controller';
import { RocketsModule } from './rockets.module';
import { e2eAuthBootstrap } from './__fixtures__/providers/e2e-auth-bootstrap.fixture';

@Injectable()
class JwtLikeGuard {
  canActivate(): boolean {
    return true;
  }
}

const baseOptions: RocketsOptions = {
  settings: {},
  auth: e2eAuthBootstrap(ServerAuthAdapterFixture),
  userMetadata: userMetadataConfigFixture,
  repository: E2eFakeRepositoryModule,
};

describe('RocketsModule routePolicy (e2e)', () => {
  let app: INestApplication;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined as unknown as INestApplication;
    }
  });

  it('audits package-owned routes: MeController appears guarded by AuthServerGuard', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [RocketsModule.forRoot({ ...baseOptions, routePolicy: {} })],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    const report = app.get(RouteAuditService).audit();

    // The guard this module registers is recognised as authentication
    // without any `authGuards` declaration.
    expect(report.authGuards).toEqual(['AuthServerGuard']);
    const me = report.routes.find((route) => route.id === 'GET /me');
    expect(me).toMatchObject({
      controller: 'MeController',
      authentication: 'guarded',
    });
  });

  // The audit exists for exactly this: a violation on a controller the
  // app did not write. `MeController` carries no AccessControlGrant, so
  // `requireAcl` must refuse the boot and name it.
  it('requireAcl fails the boot naming the package-owned route', async () => {
    await expect(
      Test.createTestingModule({
        imports: [
          RocketsModule.forRoot({
            ...baseOptions,
            routePolicy: { requireAcl: true },
          }),
        ],
      })
        .compile()
        .then((ref) => ref.createNestApplication().init()),
    ).rejects.toThrow(/requireAcl[\s\S]*\/me[\s\S]*no AccessControlGrant/);
  });

  it('allowControllers matches by identity, not by name', async () => {
    // `buildMeController` returns a fresh class per call, so the only way
    // to hold the mounted reference is to mount it explicitly.
    const meController = buildMeController(userMetadataConfigFixture);

    // A decoy sharing the NAME must not exempt the real controller —
    // name matching would pass here; identity matching must not.
    class FakeMeController {}
    Object.defineProperty(FakeMeController, 'name', { value: 'MeController' });

    await expect(
      Test.createTestingModule({
        imports: [
          RocketsModule.forRoot({
            ...baseOptions,
            controllers: [meController],
            routePolicy: {
              requireAcl: true,
              allowControllers: [FakeMeController],
            },
          }),
        ],
      })
        .compile()
        .then((ref) => ref.createNestApplication().init()),
    ).rejects.toThrow(/requireAcl[\s\S]*\/me/);

    // The real class silences it.
    const moduleRef = await Test.createTestingModule({
      imports: [
        RocketsModule.forRoot({
          ...baseOptions,
          controllers: [meController],
          routePolicy: {
            requireAcl: true,
            allowControllers: [meController],
          },
        }),
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    expect(app).toBeDefined();
  });
});

// ── The integration-owned-guard seam (the defineRocketsAuth shape) ──

describe('routePolicy with an integration-contributed guard (e2e)', () => {
  let app: INestApplication;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined as unknown as INestApplication;
    }
  });

  // A bootstrap that swaps the global guard (`providesAppGuard`) must
  // also tell the audit WHICH class the swap installs, via
  // `contributes.authGuards`. Without the merge this app reports every
  // route `unguarded-app` and requireAuth aborts the boot — the exact
  // failure `defineRocketsAuth` compositions had.
  it('recognises the contributed guard with no authGuards declaration', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        RocketsModule.forRoot({
          ...baseOptions,
          auth: {
            ...e2eAuthBootstrap(ServerAuthAdapterFixture),
            contributes: {
              enableGlobalGuard: false,
              providesAppGuard: true,
              authGuards: [JwtLikeGuard],
            },
          },
          routePolicy: { requireAuth: true },
        }),
      ],
      providers: [{ provide: APP_GUARD, useClass: JwtLikeGuard }],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    const report = app.get(RouteAuditService).audit();
    // The swap is recognised; AuthServerGuard was deliberately not
    // registered (enableGlobalGuard: false), so this is the ONLY guard.
    expect(report.authGuards).toEqual(['JwtLikeGuard']);
    expect(report.globalGuards).toEqual(['JwtLikeGuard']);
  });
});
