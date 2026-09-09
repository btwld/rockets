/**
 * E2E coverage for first-class ACL on resources and operations (#51).
 *
 * The gap: upstream's check-access handler returns `true` for any route
 * with no grant metadata, so forgetting one `AccessControl*` decorator
 * leaves an authenticated-but-unguarded route that no test notices.
 * Declaring `acl` on the bundle makes the framework materialise the
 * grants, register the `CanAccess` services, and fail at boot on the
 * combinations it cannot honour.
 *
 * The first block mirrors `rockets-core-access-control.e2e-spec.ts`
 * exactly — same rules, same roles, same expectations — but with the
 * manual per-operation decorators replaced by `acl`. That is the
 * migration claim, tested rather than asserted.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  ExecutionContext,
  Global,
  INestApplication,
  Injectable,
  Module,
  UnauthorizedException,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TypeOrmRepositoryModule } from '@concepta/rockets-repository-typeorm';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { getDynamicRepositoryToken } from '@concepta/nestjs-repository';
import { ActionEnum, withOpenApi } from '@concepta/nestjs-core';
import {
  AccessControlGrant,
  AccessControlQuery,
  AccessControlReadMany,
  type AccessControlContextInterface,
  type AccessControlServiceInterface,
  type CanAccess,
} from '@concepta/nestjs-access-control';
import { AccessControl } from 'accesscontrol';
import request from 'supertest';
import { z } from 'zod';
import type {
  AuthAdapterInterface,
  AuthAttemptResult,
  AuthRequest,
} from '../domain/interfaces/auth-adapter.interface';
import type { AuthorizedUser } from '../domain/interfaces/auth-user.interface';
import { extractBearerToken } from '../infrastructure/auth/extract-bearer-token';
import { RocketsCoreModule } from '../rockets-core.module';
import { USER_METADATA_MODULE_ENTITY_KEY } from '../rockets-core.constants';
import { AuthServerGuard } from '../infrastructure/guards/auth-server.guard';
import { defineResource } from '../infrastructure/resource/define-resource';
import { defineSubResource } from '../infrastructure/resource/define-sub-resource';
import { defineAuthAdapter } from '../infrastructure/auth/define-auth-adapter';
import { buildAppRegistrationPlan } from '../infrastructure/resource/planner';
import { operationResource } from '../zod';

// ── Auth / ACL fixtures ──

@Injectable()
class RoleAuthProvider implements AuthAdapterInterface {
  async authenticate(req: AuthRequest): Promise<AuthAttemptResult> {
    const token = extractBearerToken(req);
    if (token === null) return { matched: false };
    if (token === 'admin') {
      return {
        matched: true,
        user: {
          id: 'admin-1',
          sub: 'admin-1',
          userRoles: [{ role: { name: 'admin' } }],
        },
      };
    }
    if (token === 'user') {
      return {
        matched: true,
        user: {
          id: 'user-1',
          sub: 'user-1',
          userRoles: [{ role: { name: 'user' } }],
        },
      };
    }
    return { matched: true, error: new UnauthorizedException() };
  }
}

class AcService implements AccessControlServiceInterface {
  async getUser(context: ExecutionContext): Promise<unknown> {
    return context.switchToHttp().getRequest().user;
  }
  async getUserRoles(context: ExecutionContext): Promise<string | string[]> {
    const user = context.switchToHttp().getRequest().user as
      | Pick<AuthorizedUser, 'userRoles'>
      | undefined;
    return user?.userRoles?.map((userRole) => userRole.role.name) ?? [];
  }
}

const acRules = new AccessControl();
acRules.grant('admin').resource('widget').createAny().readAny().updateAny();
acRules.grant('user').resource('widget').readAny().updateOwn();
acRules.grant('admin').resource('gadget').createAny().readAny().updateAny();
// A sub-resource is a DIFFERENT resource in the rules — it inherits
// nothing from its parent's `acl.resource`.
acRules.grant('admin').resource('widget-note').createAny().readAny();
acRules.grant('user').resource('widget-note').readAny();

/**
 * Never registered by the test module — it must arrive in
 * `AccessControlModule` purely because the resource declared it.
 *
 * Resource-level `acl.query` binds the service at CLASS level, so it is
 * consulted on every route of the resource, not just the ones with
 * `own` possession. Collection routes carry no row to own, hence the
 * early return.
 */
@Injectable()
class WidgetAccessQueryService implements CanAccess {
  async canAccess(context: AccessControlContextInterface): Promise<boolean> {
    const request = context.getRequest() as {
      user?: { id?: string };
      params?: Record<string, string>;
    };
    const targetId = request.params?.id;
    if (targetId === undefined) return true;
    if (request.user?.id !== 'user-1') return true;
    return targetId === ownedWidgetId;
  }
}

let ownedWidgetId = '';

/**
 * Approves everything. Paired with {@link StrictQueryService} below it
 * proves that a per-operation `query` genuinely REPLACES the
 * resource-level one.
 *
 * It has to: upstream merges query metadata across class and handler and
 * breaks on the first service returning `true`, class-level first. A
 * class-level default plus a method-level "override" is an OR in which
 * the permissive one wins — so an operation could never tighten. Rockets
 * stamps exactly one service per route for this reason.
 */
@Injectable()
class PermissiveQueryService implements CanAccess {
  async canAccess(): Promise<boolean> {
    return true;
  }
}

/** Refuses everything. */
@Injectable()
class StrictQueryService implements CanAccess {
  async canAccess(): Promise<boolean> {
    return false;
  }
}

@Entity('acl_widget_notes')
class WidgetNoteEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar' }) body!: string;
  @Column({ type: 'uuid' }) widgetId!: string;
}

const widgetNoteCreateSchema = withOpenApi(
  z.object({ body: z.string() }),
  'WidgetNoteCreateDto',
);
const widgetNoteResponseSchema = withOpenApi(
  z.object({ id: z.uuid(), body: z.string() }),
  'WidgetNoteResponseDto',
);

@Entity('acl_gadgets')
class GadgetEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar' }) label!: string;
}

@Entity('acl_widgets')
class WidgetEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar' }) label!: string;
  // Phantom relation property — `subResources` keys are constrained to
  // `keyof E`, and the join itself lives on the child.
  notes?: WidgetNoteEntity[];
}

const widgetCreateSchema = withOpenApi(
  z.object({ label: z.string() }),
  'WidgetCreateDto',
);
const widgetUpdateSchema = withOpenApi(
  z.object({ label: z.string() }),
  'WidgetUpdateDto',
);
const widgetResponseSchema = withOpenApi(
  z.object({ id: z.uuid(), label: z.string() }),
  'WidgetResponseDto',
);

class StubMetadataRepo {
  async findOne() {
    return null;
  }
  async create(data: Record<string, unknown>) {
    return { id: '1', ...data };
  }
  async update(e: Record<string, unknown>, d: Record<string, unknown>) {
    return { ...e, ...d };
  }
}

const metaToken = getDynamicRepositoryToken(USER_METADATA_MODULE_ENTITY_KEY);

@Global()
@Module({
  providers: [{ provide: metaToken, useValue: new StubMetadataRepo() }],
  exports: [metaToken],
})
class MetaModule {}

// ── Resources ──

const widgetResource = defineResource<WidgetEntity>({
  key: 'widget',
  entity: WidgetEntity,
  path: 'widgets',
  tags: ['Widgets'],
  // One line replaces five per-operation `decorators` entries AND the
  // `queryServices` registration.
  acl: { resource: 'widget', query: WidgetAccessQueryService },
  dto: { response: widgetResponseSchema },
  operations: {
    list: {},
    read: {},
    create: { input: widgetCreateSchema },
    update: { input: widgetUpdateSchema },
  },
  subResources: {
    notes: defineSubResource<WidgetNoteEntity>({
      key: 'widgetNote',
      entity: WidgetNoteEntity,
      parentKey: 'widgetId',
      segment: 'notes',
      tags: ['Widget notes'],
      // The path-scope ownership guard is off: `WidgetEntity` carries no
      // owner column, and what is under test here is the ACL grant, not
      // path scoping (covered in the sub-resource suite).
      owner: false,
      // Its OWN resource name. Nothing is inherited from the parent.
      acl: { resource: 'widget-note' },
      dto: { response: widgetNoteResponseSchema },
      operations: {
        list: {},
        create: { input: widgetNoteCreateSchema },
      },
    }),
  },
});

/**
 * `read` inherits the permissive resource-level service; `update`
 * declares its own strict one. If the resource-level service were
 * stamped at class level, its `true` would short-circuit and the update
 * would be allowed.
 */
const gadgetResource = defineResource<GadgetEntity>({
  key: 'gadget',
  entity: GadgetEntity,
  path: 'gadgets',
  tags: ['Gadgets'],
  acl: { resource: 'gadget', query: PermissiveQueryService },
  dto: { response: widgetResponseSchema },
  operations: {
    read: {},
    create: { input: widgetCreateSchema },
    update: {
      input: widgetUpdateSchema,
      acl: { action: 'update', query: StrictQueryService },
    },
  },
});

/** A non-CRUD write must name its action — nothing infers it. */
const widgetOps = operationResource({
  path: 'widgets/:id',
  tags: ['Widgets'],
  acl: { resource: 'widget' },
  params: z.object({ id: z.uuid() }),
  operations: (op) => ({
    relabel: op.write({
      acl: 'update',
      input: z.object({ label: z.string() }),
      output: z.object({ ok: z.boolean() }),
      handler: () => ({ ok: true }),
    }),
    audit: op.read({
      // Deliberately ungranted: recorded, not forgotten.
      acl: false,
      output: z.object({ seen: z.boolean() }),
      handler: () => ({ seen: true }),
    }),
  }),
});

// ── Specs ──

describe('declarative resource acl (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [WidgetEntity, WidgetNoteEntity, GadgetEntity],
          synchronize: true,
          dropSchema: true,
        }),
        MetaModule,
        RocketsCoreModule.forRoot({
          auth: defineAuthAdapter(RoleAuthProvider),
          providers: [RoleAuthProvider],
          repository: TypeOrmRepositoryModule,
          resources: [widgetResource, widgetOps, gadgetResource],
          accessControl: {
            service: new AcService(),
            settings: { rules: acRules },
            appFilter: false,
            // Every authenticated route in this app declares its grant.
            enforceGrants: true,
          },
          global: true,
        }),
      ],
      providers: [{ provide: APP_GUARD, useClass: AuthServerGuard }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    const created = await request(app.getHttpServer())
      .post('/widgets')
      .set('Authorization', 'Bearer admin')
      .send({ label: 'owned' })
      .expect(201);
    ownedWidgetId = created.body.id;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('grants create to admin from the inferred action', async () => {
    await request(app.getHttpServer())
      .post('/widgets')
      .set('Authorization', 'Bearer admin')
      .send({ label: 'admin-made' })
      .expect(201);
  });

  it('denies create to a role without it — no manual decorator anywhere', async () => {
    await request(app.getHttpServer())
      .post('/widgets')
      .set('Authorization', 'Bearer user')
      .send({ label: 'nope' })
      .expect(403);
  });

  it('grants list to both roles', async () => {
    await request(app.getHttpServer())
      .get('/widgets')
      .set('Authorization', 'Bearer user')
      .expect(200);
  });

  it('still rejects unauthenticated requests before ACL runs', async () => {
    await request(app.getHttpServer()).get('/widgets').expect(401);
  });

  it('resolves the auto-registered CanAccess service for `own` possession', async () => {
    // `user` has `updateOwn`, and the query service only approves the
    // widget it owns. Nothing registered the service but the resource.
    await request(app.getHttpServer())
      .patch(`/widgets/${ownedWidgetId}`)
      .set('Authorization', 'Bearer user')
      .send({ label: 'mine' })
      .expect(200);

    const other = await request(app.getHttpServer())
      .post('/widgets')
      .set('Authorization', 'Bearer admin')
      .send({ label: 'not-mine' })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/widgets/${other.body.id}`)
      .set('Authorization', 'Bearer user')
      .send({ label: 'steal' })
      .expect(403);
  });

  it('grants a sub-resource against its OWN acl.resource', async () => {
    // `admin` has create on `widget-note`; `user` has read only. Neither
    // grant mentions `widget`, so this proves the sub-resource is not
    // borrowing its parent's name.
    await request(app.getHttpServer())
      .post(`/widgets/${ownedWidgetId}/notes`)
      .set('Authorization', 'Bearer admin')
      .send({ body: 'admin note' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/widgets/${ownedWidgetId}/notes`)
      .set('Authorization', 'Bearer user')
      .send({ body: 'nope' })
      .expect(403);
  });

  it('a per-operation query REPLACES the resource-level one', async () => {
    const created = await request(app.getHttpServer())
      .post('/gadgets')
      .set('Authorization', 'Bearer admin')
      .send({ label: 'g1' })
      .expect(201);

    // `read` inherits the permissive service.
    await request(app.getHttpServer())
      .get(`/gadgets/${created.body.id}`)
      .set('Authorization', 'Bearer admin')
      .expect(200);

    // `update` declared a strict one. If the permissive resource-level
    // service were also consulted (class level, first, break-on-true)
    // this would be a 200.
    await request(app.getHttpServer())
      .patch(`/gadgets/${created.body.id}`)
      .set('Authorization', 'Bearer admin')
      .send({ label: 'g2' })
      .expect(403);
  });

  it('enforces the declared action on a non-CRUD write', async () => {
    await request(app.getHttpServer())
      .post(`/widgets/${ownedWidgetId}/relabel`)
      .set('Authorization', 'Bearer admin')
      .send({ label: 'renamed' })
      .expect(200);
  });

  it('an `acl: false` operation stays reachable by any authenticated actor', async () => {
    await request(app.getHttpServer())
      .get(`/widgets/${ownedWidgetId}/audit`)
      .set('Authorization', 'Bearer user')
      .expect(200);
  });
});

describe('declarative resource acl — boot failures', () => {
  const bareResource = defineResource<WidgetEntity>({
    key: 'widget',
    entity: WidgetEntity,
    path: 'widgets',
    tags: ['Widgets'],
    dto: { response: widgetResponseSchema },
    operations: { list: {} },
  });

  const aclResource = defineResource<WidgetEntity>({
    key: 'widget',
    entity: WidgetEntity,
    path: 'widgets',
    tags: ['Widgets'],
    acl: { resource: 'widget' },
    dto: { response: widgetResponseSchema },
    operations: { list: {} },
  });

  it('rejects a bundle that declares acl with no root accessControl', () => {
    expect(() =>
      buildAppRegistrationPlan({
        resources: [aclResource],
        repository: TypeOrmRepositoryModule,
        accessControl: false,
      }),
    ).toThrow(/declared `acl` but the app configured no root/);
  });

  it('rejects an ungranted authenticated operation under enforceGrants', () => {
    expect(() =>
      buildAppRegistrationPlan({
        resources: [bareResource],
        repository: TypeOrmRepositoryModule,
        accessControl: true,
        enforceGrants: true,
      }),
    ).toThrow(/carry no grant/);
  });

  it('accepts the same app once the bundle declares acl', () => {
    expect(() =>
      buildAppRegistrationPlan({
        resources: [aclResource],
        repository: TypeOrmRepositoryModule,
        accessControl: true,
        enforceGrants: true,
      }),
    ).not.toThrow();
  });

  it('rejects enforceGrants without root accessControl', () => {
    expect(() =>
      buildAppRegistrationPlan({
        resources: [bareResource],
        repository: TypeOrmRepositoryModule,
        accessControl: false,
        enforceGrants: true,
      }),
    ).toThrow(/requires root `accessControl`/);
  });

  it('rejects a per-operation acl action with no resource-level acl', () => {
    expect(() =>
      defineResource<WidgetEntity>({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widgets',
        tags: ['Widgets'],
        dto: { response: widgetResponseSchema },
        operations: { list: { acl: 'read' } },
      }),
    ).toThrow(/needs a resource-level/);
  });

  it('rejects a public resource that also declares acl', () => {
    expect(() =>
      defineResource<WidgetEntity>({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widgets',
        tags: ['Widgets'],
        public: true,
        acl: { resource: 'widget' },
        dto: { response: widgetResponseSchema },
        operations: { list: {} },
      }),
    ).toThrow(/public but carries an `acl` grant/);
  });

  it('allows a public resource whose operations opt out explicitly', () => {
    expect(() =>
      defineResource<WidgetEntity>({
        key: 'widget',
        entity: WidgetEntity,
        path: 'widgets',
        tags: ['Widgets'],
        public: true,
        acl: { resource: 'widget' },
        dto: { response: widgetResponseSchema },
        operations: { list: { acl: false } },
      }),
    ).not.toThrow();
  });

  it('rejects an operationResource write with no acl action', () => {
    expect(() =>
      operationResource({
        path: 'things',
        acl: { resource: 'thing' },
        operations: (op) => ({
          go: op.write({
            output: z.object({ ok: z.boolean() }),
            handler: () => ({ ok: true }),
          }),
        }),
      }),
    ).toThrow(/writes but declares no/);
  });

  it('leaves a manual-decorator app alone when enforceGrants is off', () => {
    const manual = defineResource<WidgetEntity>({
      key: 'widget',
      entity: WidgetEntity,
      path: 'widgets',
      tags: ['Widgets'],
      dto: { response: widgetResponseSchema },
      operations: { list: { decorators: [AccessControlReadMany('widget')] } },
    });

    expect(() =>
      buildAppRegistrationPlan({
        resources: [manual],
        repository: TypeOrmRepositoryModule,
        accessControl: true,
      }),
    ).not.toThrow();
  });
});
// ── acl + manual AccessControl* on ONE operation: refused, not clobbered ──
//
// Grant metadata is last-write-wins. The generated route used to apply
// the consumer's decorators first and the acl-derived grant last, so a
// hand-written grant — possibly TIGHTER than the inferred action —
// was silently replaced and the route audit reported only the
// survivor. For operation resources the builder owns the single
// decorator application, so this is decidable at definition time.

describe('acl + manual grant is refused at definition time', () => {
  // The sibling slot: a manual AccessControlQuery — a deliberately
  // TIGHTER row filter — was still silently replaced when only the
  // grant key was read back.
  it('throws on a manual AccessControlQuery too', () => {
    expect(() =>
      operationResource({
        path: 'clobber-query-probe',
        acl: { resource: 'widget', query: WidgetAccessQueryService },
        operations: (op) => ({
          run: op.read({
            acl: 'read',
            output: z.object({ ok: z.boolean() }),
            handler: () => ({ ok: true }),
            decorators: [
              AccessControlQuery({
                service: StrictQueryService,
              }) as MethodDecorator,
            ],
          }),
        }),
      }),
    ).toThrow(/declares `acl` AND carries a hand-written/);
  });

  // acl: false is a recorded opt-out — manual decorators are then the
  // ONLY writer, no ambiguity, must not throw.
  it('does not throw when the operation opts out with acl: false', () => {
    expect(() =>
      operationResource({
        path: 'optout-probe',
        acl: { resource: 'widget' },
        operations: (op) => ({
          run: op.read({
            acl: false,
            output: z.object({ ok: z.boolean() }),
            handler: () => ({ ok: true }),
            decorators: [
              AccessControlGrant({
                resource: 'widget',
                action: ActionEnum.READ,
              }) as MethodDecorator,
            ],
          }),
        }),
      }),
    ).not.toThrow();
  });

  it('throws naming the operation', () => {
    expect(() =>
      operationResource({
        path: 'clobber-probe',
        acl: { resource: 'widget' },
        operations: (op) => ({
          run: op.read({
            acl: 'read',
            output: z.object({ ok: z.boolean() }),
            handler: () => ({ ok: true }),
            decorators: [
              AccessControlGrant({
                resource: 'widget',
                action: ActionEnum.DELETE,
              }) as MethodDecorator,
            ],
          }),
        }),
      }),
    ).toThrow(/declares `acl` AND carries a hand-written/);
  });
});
