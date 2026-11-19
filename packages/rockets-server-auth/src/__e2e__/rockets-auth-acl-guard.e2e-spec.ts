import { describe, it, expect, afterAll } from 'vitest';
import 'reflect-metadata';

import {
  CanActivate,
  Controller,
  Get,
  INestApplication,
  Injectable,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import request from 'supertest';
import { AccessControl } from 'accesscontrol';
import { AuthPublic, RouteAuditService } from '@concepta/rockets-core';

import { AccessControlReadMany } from '../index';
import {
  createRocketsAuthStandardE2eTestingModule,
  type CreateRocketsAuthStandardE2eModuleOptions,
} from './helpers/rockets-auth-e2e-app.factory';

/**
 * A built-in-auth app owns `AccessControlModule` inside `RocketsAuthModule`,
 * so core's planner never sees its `accessControl` options. Only the
 * bootstrap route audit stands between `appGuard: false` and grant metadata
 * that enforces nothing, and only the `contributes.aclGuards` merge lets a
 * custom guard satisfy that audit. Both are proven here on a booted app.
 */
@Injectable()
class DenyAllAclGuard implements CanActivate {
  canActivate(): boolean {
    return false;
  }
}

@Controller('acl-widgets')
@ApiTags('Test')
class GrantedWidgetController {
  // Public for authentication so the request reaches the ACL guard
  // without a JWT: the global ACL guard is the only thing that can deny it.
  @Get()
  @AuthPublic()
  @AccessControlReadMany('widget')
  @ApiOkResponse({ description: 'Granted test route' })
  list(): { ok: true } {
    return { ok: true };
  }
}

async function compile(
  accessControl: CreateRocketsAuthStandardE2eModuleOptions['rocketsAuthOverrides'],
): Promise<INestApplication> {
  const module = await createRocketsAuthStandardE2eTestingModule({
    mockEmailService: { sendMail: async () => undefined },
    extraControllers: [GrantedWidgetController],
    rocketsAuthOverrides: accessControl,
  });
  return module.createNestApplication();
}

describe('built-in auth — ACL guard reach (e2e)', () => {
  const apps: INestApplication[] = [];

  afterAll(async () => {
    await Promise.all(apps.map((app) => app.close()));
  });

  it('boots with a custom ACL guard and that guard enforces the grant', async () => {
    const app = await compile({
      accessControl: {
        settings: { rules: new AccessControl() },
        appGuard: new DenyAllAclGuard(),
      },
    });
    apps.push(app);
    await app.init();

    const report = app.get(RouteAuditService).audit();
    expect(report.aclGuards).toEqual(['DenyAllAclGuard']);
    expect(report.globalGuards).toContain('DenyAllAclGuard');

    // Recognition alone would pass with a guard that never runs; the 403
    // proves the recognised guard is the one actually on the route.
    await request(app.getHttpServer()).get('/acl-widgets').expect(403);
  });

  it('boots with the default AccessControlGuard recognised', async () => {
    const app = await compile({
      accessControl: { settings: { rules: new AccessControl() } },
    });
    apps.push(app);
    await app.init();

    const report = app.get(RouteAuditService).audit();
    expect(report.aclGuards).toEqual(['AccessControlGuard']);
  });

  it('refuses to boot when appGuard is disabled with no replacement', async () => {
    const app = await compile({
      accessControl: {
        settings: { rules: new AccessControl() },
        appGuard: false,
      },
    });
    apps.push(app);

    await expect(app.init()).rejects.toThrow(
      /requireAclGuard[\s\S]*GET \/acl-widgets[\s\S]*no recognised GLOBAL authorization guard/,
    );
  });
});
