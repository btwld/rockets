# @concepta/rockets-core

[![NPM](https://img.shields.io/npm/v/@concepta/rockets-core)](https://www.npmjs.com/package/@concepta/rockets-core)
[![NestJS](https://img.shields.io/badge/NestJS-12-ea2845?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

> Configuration-driven composition layer: one options object → planner →
> upstream `@concepta/nestjs-*` modules registered as Nest imports.

**Status:** pre-1.0 preview. The package manifest is set to `1.0.0-alpha.8`, but
registry publication is pending; install commands below apply after the
`alpha` dist-tag is updated.

---

## 1. Introduction

`@concepta/rockets-core` is the **planner and wiring layer** — not the
repository/CRUD/hook motor. It solves: _“I already use Concepta motors, but I
still hand-wire Nest modules, entity lists, and auth guards on every new
service.”_ The motor is `@concepta/nestjs-repository`, `@concepta/nestjs-crud`,
and `@concepta/nestjs-core` (hook resolution) — core depends on them directly
and re-exports the symbols apps need (`InjectDynamicRepository`,
`RepositoryInterface`, `AuthUser`, `SwaggerUiModule`, …; the former
`@concepta/rockets-common` package was merged into core). Core owns:

- An auth contract (`AuthAdapterInterface`) and a global guard that runs
  adapters in a chain.
- A resource planner (`buildAppRegistrationPlan`) that turns a list of feature
  bundles into Nest imports, dynamic repository registrations, and CRUD /
  operation controllers.
- Reusable repository hooks for owner scoping, audit, and path-scoped
  sub-resources.
- A typed actor overlay so handlers can read the authenticated user without
  parameter drilling.
- A zod-first layer at `@concepta/rockets-core/zod` (`zodResource`,
  `operationResource`, …) for schema-driven CRUD and typed non-CRUD HTTP.
- Opt-in, vendor-neutral Standard Schema DTOs for hand-written Nest
  controllers.

### When to use this package

- You want full control over composition (no `/me` route, no global guard
  defaults) and will write a thin server module yourself.
- You are building another package (an adapter, a presentation layer) that needs
  the same contracts as `@concepta/rockets` and `@concepta/rockets-auth`.

### When NOT to use this package

- You want an external-auth server with `/me` and a global guard out of the box
  → use `@concepta/rockets`.
- You want a complete built-in auth system (signup, login, OTP, admin) → use
  `@concepta/rockets-auth`.

`@concepta/rockets` re-exports a curated application-facing subset of core;
advanced context overlays, low-level CRUD compatibility types, Swagger module
registration, and hook-construction utilities remain core-only.
`@concepta/rockets-auth` is a sibling identity bundle rather than a core
facade. Depend on core directly when you use one of those lower-level seams.

---

## 2. Get Started

### Install

```bash
yarn add @concepta/rockets-core@alpha \
  @nestjs/common @nestjs/core @nestjs/cqrs @nestjs/swagger zod
```

### Minimal working example

A bare app with one auth adapter and one CRUD resource. No HTTP controller code
— the controller is generated from `defineResource`.

```typescript
// src/auth/jwt.adapter.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { verify } from 'jsonwebtoken';
import {
  AuthAdapterInterface,
  AuthAttemptResult,
  AuthRequest,
  extractBearerToken,
} from '@concepta/rockets-core';

@Injectable()
export class JwtAdapter implements AuthAdapterInterface {
  async authenticate(request: AuthRequest): Promise<AuthAttemptResult> {
    const token = extractBearerToken(request);
    if (token === null) return { matched: false };
    try {
      const payload = verify(token, process.env.JWT_SECRET!) as {
        sub: string;
        email?: string;
      };
      return {
        matched: true,
        user: { id: payload.sub, sub: payload.sub, email: payload.email },
      };
    } catch {
      return { matched: true, error: new UnauthorizedException() };
    }
  }
}
```

```typescript
// src/app.module.ts
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import {
  RocketsCoreModule,
  AuthServerGuard,
  defineAuthAdapter,
  defineResource,
} from '@concepta/rockets-core';
import { JwtAdapter } from './auth/jwt.adapter';
import { PetEntity } from './pet.entity';
import { defineTypeOrmRepository } from '@concepta/rockets-repository-typeorm';

@Module({
  imports: [
    RocketsCoreModule.forRoot({
      auth: defineAuthAdapter(JwtAdapter),
      repository: defineTypeOrmRepository({
        type: 'sqlite',
        database: ':memory:',
        synchronize: true,
      }),
      resources: [defineResource({ entity: PetEntity })],
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: AuthServerGuard }],
})
export class AppModule {}
```

### What just happened

- `defineAuthAdapter(JwtAdapter)` registered and exported the adapter; core
  exposes the ordered chain on `AUTH_ADAPTERS_TOKEN` for `AuthServerGuard`.
- `repository: defineTypeOrmRepository(...)` is the only place that mentions
  TypeORM. The planner collects entities from `resources[]` and registers them.
- `defineResource({ entity: PetEntity })` produced `GET/POST/PATCH/DELETE /pets`
  with validation and Swagger schema. No controller was written.

`defineTypeOrmRepository` is owned by
`@concepta/rockets-repository-typeorm`; core remains storage-agnostic.

---

## 3. How-to Guides

### Add a non-CRUD feature (controller + service + entity)

Use `defineModuleResource` when a feature needs its own Nest wiring or a
junction table without auto-generated CRUD.

```typescript
import { defineModuleResource } from '@concepta/rockets-core';

export const billingFeature = defineModuleResource({
  entities: [InvoiceEntity],
  controllers: [BillingController],
  providers: [BillingService],
  exports: [BillingService], // only what other bundles inject
});
```

`RocketsCoreModule` is global, so anything in `exports` is visible app-wide.
Export the minimum to avoid name collisions across bundles.

### Add typed non-CRUD endpoints (`operationResource`)

For RPC-style routes without a hand-written controller, use
`operationResource` from `@concepta/rockets-core/zod` (or
`defineOperationResource` on the main entry with named schemas):

```typescript
import { operationResource } from '@concepta/rockets-core/zod';
import { z } from 'zod';

export const ops = operationResource({
  path: 'ops',
  public: true,
  operations: (op) => ({
    ping: op.read({
      path: '',
      output: z.object({ ok: z.boolean() }),
      handler: () => ({ ok: true }),
    }),
    shout: op.write({
      input: z.object({ text: z.string().min(1) }),
      output: z.object({ text: z.string() }),
      handler: ({ input }) => ({ text: input.text.toUpperCase() }),
    }),
  }),
});
```

`output` is required (schema or `false`). Path defaults to the operation key.
Optional resource-level `params` validates `:path` params. Full rules:
[CONFIGURATION.md §6a](../../CONFIGURATION.md#6a-operationresource--typed-non-crud-endpoints-issue-43--50).
Class handlers may be passed directly or as `{ useClass: Handler }`; explicit
resource providers for the same token take precedence over auto-registration.

With an `input` declared, the request payload must be a plain JSON object —
an array, a scalar, or a `Buffer` returns `400` rather than being narrowed to
`{}`. A missing body is still `{}`, so a `POST` with no payload against an
all-optional `input` stays legal.

Planner collision checks only cover Rockets-owned structured routes. For a
real adapter audit after global prefix/versioning/manual controllers are
registered, call `validateRegisteredRoutes(app)` after `app.init()`.

### Stream Server-Sent Events (`op.sse`)

`op.sse()` is the same resource, same auth/`public`/`acl`, same query
validation as any other operation — the handler just returns an
`Observable<MessageEvent>` instead of a JSON value, and there is no
`output` to declare:

```typescript
import { operationResource } from '@concepta/rockets-core/zod';
import { interval, map } from 'rxjs';
import type { Observable } from 'rxjs';
import type { MessageEvent } from '@nestjs/common';

export const notifications = operationResource({
  path: 'notifications',
  operations: (op) => ({
    stream: op.sse({
      handler: (): Observable<MessageEvent> =>
        // Every stream needs a teardown path. `interval` unsubscribes
        // its timer when the client disconnects; a hand-built
        // `new Observable(...)` must RETURN an unsubscribe function, or
        // the subscription outlives the connection.
        interval(1000).pipe(map((n) => ({ data: { tick: n } }))),
    }),
  }),
});
```

Guards, ACL and input validation run BEFORE the stream opens — a
rejected request looks like a normal JSON error response. The route is
GET-only and that is enforced at definition time, and a mid-stream
failure is masked the same way a 5xx JSON body is. Full rules (plus the
teardown-carrying long-form example, and why HTTP Range is a separate
follow-up): [CONFIGURATION.md
§6c](../../CONFIGURATION.md#6c-opsse--server-sent-events-issue-52-v1).

Two more patterns build on `operationResource` without changing it:
background jobs (`JobDispatchServiceInterface` — dedupe, lease, at-least-once
delivery, a `202` + job id op with a worker claiming separately) and
idempotent writes / inbound webhooks (`IdempotencyStoreInterface` +
`createWebhookSignatureVerifier` / `verifyWebhookSignature`, the latter
reading `req.rawBody` off Nest's own `rawBody: true` app option). Scope the
idempotency key by the authenticated principal — the header value is
client-chosen, so a raw key leaks one user's stored response to another.
The store de-duplicates sequential retries; it is at-least-once, not
exactly-once, under a concurrent burst. Both:
[CONFIGURATION.md §6d/§6e](../../CONFIGURATION.md#6d-background-job-dispatch-issue-53).

### Scope rows to the authenticated user

`OwnerStampHook` writes `userId` on create/update and rejects spoofing.
`OwnerScopeHook` filters list/read/update/delete by `userId`. Both default to a
`userId` column; pass a second argument to override.

```typescript
import { OwnerStampHook, OwnerScopeHook } from '@concepta/rockets-core';

defineResource({
  entity: PetEntity,
  hooks: [OwnerStampHook.for(PetEntity), OwnerScopeHook.for(PetEntity)],
});
```

The hooks run at the repository layer, so direct (non-HTTP) calls are scoped
too.

### Scope rows to a multi-tenant set (`TenantScopeHook`)

`OwnerScopeHook` compares a column to `actor.id` — one owner, one id.
`TenantScopeHook` is for the wider case: an actor who belongs to a
RESOLVED SET of tenants (a `resolve(actor)` callback you supply, e.g. a
shelter-membership lookup) and, critically, is **fail-closed**: no actor,
or a `resolve` that returns `[]`, both produce zero rows — never an
unfiltered query. It complements `acl` (issue #51): `acl` decides which
ACTIONS an actor may perform, this decides which ROWS.

```typescript
import { TenantScopeHook, TenantStampHook } from '@concepta/rockets-core';

const shelterScope = {
  tenantKey: 'shelterId' as const,
  resolve: (actor) => shelterIdsFor(actor), // [] when the actor owns none
};

defineResource({
  entity: PetEntity,
  hooks: [
    TenantScopeHook.for(PetEntity, shelterScope),
    TenantStampHook.for(PetEntity, shelterScope),
  ],
});
```

A row outside the resolved set 404s (not 403) — the query excludes it
entirely, so confirming it exists is never on the table.

**Wire both hooks.** `TenantScopeHook` rewrites `where` clauses only, so on
its own it does not stop a `POST`/`PATCH` writing another tenant's id into
the tenant column — a `PATCH` can move the actor's own row out of their
tenant. `TenantStampHook` enforces the same resolved set on
`beforeCreate`/`beforeUpdate`, rejecting (never silently rewriting) a value
outside it. `OwnerStampHook` does **not** cover this: it stamps `actor.id`,
which is not a tenant id.

Full rules:
[CONFIGURATION.md §5b](../../CONFIGURATION.md#5b-tenantscopehook--fail-closed-tenant-row-scoping-issue-69).

### Functional entity hooks (`defineHook`)

For validation, normalization, or uniqueness checks without a Nest `@Injectable`
class, use `defineHook`. It returns a hook token you pass in `hooks:` like the
built-ins:

```typescript
import { defineHook } from '@concepta/rockets-core';
import { PetEntity } from './pet.entity';

export const PetNameNormalizeHook = defineHook(PetEntity, {
  beforeCreate: (payload) => ({ ...payload, name: payload.name.trim() }),
  beforeUpdate: (payload) => ({ ...payload, name: payload.name.trim() }),
});
```

Lifecycle callbacks receive `(payload | options, ctx, tools)` where `tools.repo`
is the entity repository and `tools.actor` is the authenticated user. For
cross-service logic, author a class hook with `@EntityHook` instead.

### Mix two persistence adapters

The default adapter goes in `repository:`. Override per entity inside
`defineModuleResource` with a `RepositoryBootstrap` (same pattern as TypeORM):

```typescript
import { defineModuleResource } from '@concepta/rockets-core';
import { defineFirestoreRepository } from '@concepta/rockets-repository-firestore';

const firestoreRepository = defineFirestoreRepository();

defineModuleResource({
  entities: [
    {
      entity: AnalyticsEventEntity,
      repository: firestoreRepository,
      collection: 'analytics_events',
    },
  ],
});
```

The default bootstrap owns SQL entities; Firestore override entities get their
own `forRoot` / `forFeature` cycle. See
[sample-code-review](../../examples/sample-code-review).

**Boot order (mixed store):** for each distinct `RepositoryBootstrap` in the
plan, core imports `bootstrap.forRoot(entities)` first, then one
`RepositoryModule.forFeature(entry)` import per adapter group. SQL connection
and Firestore Admin validation therefore run before repository tokens
materialise.

### Inject a dynamic repository

The string key is derived from the entity name (`PetEntity` → `'pet'`). Pass the
class for the recommended form, or an explicit string for namespaced keys.

```typescript
import { type PlainLiteralObject } from '@nestjs/common';
import {
  InjectDynamicRepository,
  RepositoryInterface,
  Where,
} from '@concepta/rockets-core';

@Injectable()
export class PetService {
  constructor(
    @InjectDynamicRepository(PetEntity)
    private readonly pets: RepositoryInterface<PetEntity>,
  ) {}

  // `ctx` is `PlainLiteralObject` — what the repository's `ctx` option
  // accepts. A `RocketsCrudContext` from a hook or a CQRS handler
  // satisfies it; so does the context `TransactionScope.run` hands back.
  byOwner(ownerId: string, ctx: PlainLiteralObject) {
    return this.pets.find({
      where: Where.eq<PetEntity>('userId', ownerId),
      // Always forward `ctx`. See below — omitting it is silent.
      ctx,
    });
  }
}
```

#### Always pass `ctx`

A repository call that omits `ctx` runs with **all entity hooks
disabled** and **outside the surrounding operation's transaction**.
Neither is a type error and neither shows up in a passing test — it is
the defect class behind issue #45.

Take the context from wherever you are: a hook's second argument (typed
`EntityHookContext`), `query.context` in a CQRS handler, or the `txCtx`
`TransactionScope.run` hands its callback. All three satisfy the
repository's `ctx?: PlainLiteralObject`. Never spread it into a new
object — it is an `AppContextHost` Proxy and spreading strips the overlay
accessors. `CONFIGURATION.md` §8a has the full seam, including what
`run()` does and does not guarantee, the nested-scope boundary, and an
audit `grep`.

### Read the authenticated user inside a handler

CRUD-generated controllers do not expose method signatures you can decorate. Use
`getActor(context)` inside command/query handlers.

```typescript
import { CommandHandler } from '@nestjs/cqrs';
import { getActor } from '@concepta/rockets-core';

@CommandHandler(CrudCreateCommand)
export class PetCreateHandler {
  execute(cmd: CrudCreateCommand) {
    const actor = getActor(cmd.context);
    // actor.id, actor.email, actor.userRoles
  }
}
```

### Mark a route as public

The global `AuthServerGuard` skips routes tagged with `@AuthPublic`.

```typescript
import { Controller, Get } from '@nestjs/common';
import { AuthPublic } from '@concepta/rockets-core';

@Controller('health')
export class HealthController {
  @Get()
  @AuthPublic()
  ok() {
    return { status: 'ok' };
  }
}
```

### Session-cookie routes and CSRF (issue #58)

`AuthPublic` (above) and `AuthSession` are the other two legs of a
ternary route policy: `public` (no auth), `internal` (the default — no
decorator, whatever adapter matches), `session` (`AuthSession()` —
cookie-authenticated AND CSRF-protected on state-changing requests).

```typescript
import { AuthSession, CsrfGuard, CSRF_GUARD_OPTIONS_TOKEN } from '@concepta/rockets-core';

@Controller('profile')
export class ProfileController {
  @Post()
  @AuthSession()
  update(@Body() dto: UpdateProfileDto) { … }
}

// app.module.ts
providers: [
  { provide: APP_GUARD, useClass: AuthServerGuard },
  { provide: APP_GUARD, useClass: CsrfGuard },
  {
    provide: CSRF_GUARD_OPTIONS_TOKEN,
    useValue: { secret: process.env.CSRF_SECRET!, sessionCookieName: '__session' },
  },
],
```

`CsrfGuard` no-ops on every route that is not `AuthSession()` — a
bearer-only app that registers it anyway sees no behavior change.

Two things to know before shipping it:

- **`secret` is validated at boot**: non-empty and at least 32
  characters (`MIN_CSRF_SECRET_LENGTH`). The `process.env.CSRF_SECRET!`
  above throws at startup if that variable is unset, which is the point
  — it used to reach production and fail on the first protected write.
- **`@AuthSession()` enforces nothing on its own.** The decorator is
  metadata; `CsrfGuard` is what reads it. To have the boot verify a CSRF
  guard actually exists for your session routes, declare
  `routePolicy: { requireCsrf: true }`.

Full pattern (cookie minting, token generation, the double-submit
design, `requireCsrf`):
[CONFIGURATION.md §7c](../../CONFIGURATION.md#7c-session-cookie-auth-csrf-and-the-ternary-route-policy-issue-58).

### Free-form JSON columns

A settings blob, a flexible profile or a widget config has no fixed
shape. Declare it as what it is — a record — and tell the entity
compiler which column type stores it:

```typescript
const petSchema = baseEntity({
  name: f.string({ max: 100 }),
  profile: z
    .record(z.string(), z.unknown())
    .optional()
    .register(rocketsFieldMeta, { db: { column: { type: 'json' } }, dto: { response: true } }),
});
```

The request schema accepts any keys under `profile`, the row stores
them verbatim, and the response schema emits them because the field
opted in (`dto: { response: true }`). Nothing strips the blob on the
way in or out — the schema is the whole contract.

### Customise the error envelope

`RocketsCoreExceptionsFilter` replies with
`{ statusCode, errorCode, message, timestamp }`. To ship a different
shape, provide a serializer instead of forking the filter — the fork is
what used to cost apps the `context.originalError` unwrap chain, and
without that chain every hook `409` becomes a `500`.

```typescript
import {
  RocketsCoreExceptionsFilter,
  defaultErrorSerializer,
  type RocketsErrorContext,
  type RocketsErrorSerializerInterface,
} from '@concepta/rockets-core';

class TraceEnvelope implements RocketsErrorSerializerInterface {
  serialize(context: RocketsErrorContext) {
    // Extend the default rather than restating its keys.
    return { ...defaultErrorSerializer.serialize(context), traceId };
  }
}

app.useGlobalFilters(
  new RocketsCoreExceptionsFilter(httpAdapterHost, new TraceEnvelope()),
);
```

Registering the filter through Nest instead? Provide the token:

```typescript
providers: [
  { provide: APP_FILTER, useClass: RocketsCoreExceptionsFilter },
  { provide: ROCKETS_ERROR_SERIALIZER_TOKEN, useClass: TraceEnvelope },
]
```

The serializer decides the **body only**. The status code, the domain
exception → 4xx mapping and the unwrap chain stay in the filter, because
those are the parts apps kept getting wrong. `RocketsErrorContext` also
carries `originalException` — the exception as thrown, before unwrapping,
for correlation IDs and structured logs. Need more than the body? The
unwrap helpers are `protected`, so a subclass can reuse them.

Validation `400`s produced by Rockets carry structured `details` on the
serializer context — `path` as an ARRAY of segments (numeric for array
indexes), `message` verbatim, one entry per unrecognized strict key.
Every route produces them the same way: the per-route Standard Schema
pipe runs with `rocketsSchemaValidation`, whose exception factory
attaches the issues. Details ride the exception under a
symbol, never inside the response payload, so an app without the
Rockets filter sees the exact Nest body it always did. The default
envelope is unchanged; opt in with the exported
`detailedErrorSerializer`, or read `context.details` in your own.
`context.request` carries the request in the same typed shape operation
handlers receive (`headers` / `params` / `query` / `raw`) — treat `raw`
like `OperationRequest.raw`: an escape hatch, never something to
`JSON.stringify` (circular on Express). `headers` includes whatever the
client sent — `authorization` and `cookie` too — so never log or echo
the whole context from a serializer; read the specific fields you need.
Reach, stated plainly: this flows through `RocketsCoreExceptionsFilter`,
and reach is per APP, not per package — nothing is inherited by
composition. Every app registers the filter itself, whether by
`app.useGlobalFilters(...)` or an `APP_FILTER` provider, importing it
from `@concepta/rockets-core` or as `ExceptionsFilter` from
`@concepta/rockets`. Do that and the seam is yours, on core, server and
`@concepta/rockets-auth` alike; skip it and no Rockets package supplies
one for you.

Three helpers are exported for app code. `attachErrorDetails(exception,
details)` puts findings on YOUR exception (a hook rejecting a write, a
guard) so they flow to the serializer like Rockets' own — it no-ops on
an empty list and on a frozen exception, and never touches the response
payload. `readErrorDetails(exception)` is the validated read — a carried list
with ANY malformed entry is dropped as a whole, not partially laundered
into the typed contract. `standardSchemaIssuesToDetails(issues)`
converts Standard Schema issues into detail entries — the one to reach
for when supplying your own `exceptionFactory`. Opting the default body
in is one provider:

```typescript
{ provide: ROCKETS_ERROR_SERIALIZER_TOKEN, useValue: detailedErrorSerializer }
```

### Hand-written routes

Hand-written controllers run on the same engine as generated CRUD: Nest
12's native Standard Schema pipe per route, a named zod schema per body,
schema serialization for the response.

```typescript
import {
  Body, Controller, Post, SerializeOptions, StandardSchemaSerializerInterceptor,
  StandardSchemaValidationPipe, UseInterceptors, UsePipes,
} from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { rocketsSchemaValidation, withOpenApi } from '@concepta/rockets-core';
import { z } from 'zod';

const signupSchema = withOpenApi(
  z.object({ email: z.email(), password: z.string().min(8) }),
  'SignupDto',
);
const signupResponseSchema = withOpenApi(
  z.object({ id: z.uuid(), email: z.email() }),
  'SignupResponseDto',
);

@Controller('auth')
@UsePipes(new StandardSchemaValidationPipe(rocketsSchemaValidation))
@UseInterceptors(StandardSchemaSerializerInterceptor)
export class AuthController {
  @Post('signup')
  @SerializeOptions({ schema: signupResponseSchema })
  @ApiResponse({ status: 201, standardSchema: signupResponseSchema })
  signup(@Body({ schema: signupSchema }) body: z.output<typeof signupSchema>) {
    // ...
  }
}
```

The body parameter is typed with `z.output<typeof schema>` — never a
class — and `@Body({ schema })` is what both validates and documents it.
`rocketsSchemaValidation` makes the `400` carry structured `details`
like every other Rockets route. Never register a **global**
`StandardSchemaValidationPipe`: Rockets routes carry their own, a global
one would validate every body twice, and core refuses to boot with one.
Prefer `operationResource` for a JSON endpoint the generators can
express; hand-written routes are for surfaces they cannot produce yet
(streaming, file routes — #52, #86).

### Zod-first resources (`@concepta/rockets-core/zod`)

The zod-first resource layer ships as the subpath export
`@concepta/rockets-core/zod` (`zodResource`, `zodSubResource`,
`operationResource`, `bindZodResources`, the `f.*` field helpers,
`defineZodUserMetadata`, `rocketsFieldMeta`, `rocketsEntityMeta`). `zod` is a
dependency of core: every resource contract — `defineResource` DTOs
included — is a named zod schema, and the subpath is where the schema is
also the source of the entity.

Entity generation is delegated to a `SchemaEntityCompiler`. The TypeORM
implementation lives at `@concepta/rockets-repository-typeorm/zod`; bind it
once at startup:

```typescript
import { bindZodResources } from '@concepta/rockets-core/zod';
import { typeOrmZodEntityCompiler } from '@concepta/rockets-repository-typeorm/zod';

bindZodResources(typeOrmZodEntityCompiler);
```

See `examples/sample-server/src/zod-bindings.ts` for the canonical wiring.

#### Wire vs persistence typing

- **`WireRow<S>`** — what a client receives: the schema output after
  JSON encoding (`JsonEncoded<z.output<S>>`, so `Date` → ISO string).
  Use in client contracts and response assertions.
- **`SchemaPersistenceRow<S>`** — the row itself (`z.output<S>`:
  `Date` for `f.date()` / audit columns). Use in hooks, handlers,
  `@InjectDynamicRepository`.
- Generated entity classes are typed as
  `Type<SchemaPersistenceRow<S>>`, not the wire shape.

#### Field helpers (`f.*`)

| Helper | Use for |
|--------|---------|
| `f.pk()` | UUID primary key |
| `f.createdAt()` / `f.updatedAt()` / `f.deletedAt()` | Audit columns (`z.date()`) |
| `f.date()` | Writable datetime — ISO string in, `Date` in the row, `string/date-time` in OpenAPI. Also accepts a numeric timestamp or a `Date` (documented trade-off); `null`, booleans and anything else are a `400`, never the epoch |
| `f.version()` | Optimistic lock |
| `f.owner()` | Owner stamp column |
| `f.fk(target, opts)` | FK + `manyToOne` / `oneToOne` |
| `f.hasMany(elementSchema, opts)` | `@OneToMany` inverse — **never** `z.array(z.unknown())` |
| `f.string` / `f.int` / `f.bool` / `f.enum` | Scalars |
| `f.compute(schema, fn)` | Response-only computed fields |

Eager `compileEntity` in `*.schema.ts` is only for import-cycle breaks
(`@EntityHook`, inverse `@OneToMany`). Default: let
`zodResource({ schema })` compile.

#### Per-operation `input` / `output`

Each CRUD operation can override the request body and the response
projection with its own schema, exactly as the class path does with DTO
classes. Omit them and the operation keeps the schema-derived projection.

```ts
zodResource({
  name: 'Article',
  schema: articleSchema,
  operations: {
    // A thinner card projection for the collection route.
    list: { output: z.object({ id: z.uuid(), title: z.string() }) },
    read: true,
    // `slug` is derived server-side, so it is not part of this body.
    create: { input: z.object({ title: z.string(), body: z.string() }) },
  },
});
```

Rules worth knowing:

- An override **replaces** the projection; it is not merged with it. A
  field hidden by `dto: { response: false }` is exposed again if the
  override declares it — the same explicit opt-in the class path has.
- Generated components are named `<Name><Op>InputDto` /
  `<Name><Op>OutputDto`, and a `list` override gets a matching paginated
  wrapper automatically.
- `input` is rejected on operations with no request body, and `output`
  is rejected on `delete` / `restore` unless `returnDeleted` /
  `returnRestored` makes the route answer with a body. Both fail at
  definition time rather than being dropped silently on the wire.
  `returnDeleted` applies to a **hard** delete too — upstream sets the
  status from that flag alone, so `delete: { returnDeleted: true }` with
  an `output` is a valid shape without `soft: true`.
- `strictInput: true` rejects unknown **top-level** body keys with `400`
  (naming the keys) instead of silently stripping them (issue #79). It
  applies to whichever input schema is in effect — the derived
  projection or an `input` override. Nested objects still strip: zod's
  `.strict()` does not recurse. Server-owned fields the projection
  excludes (`id`, timestamps, `version`, owner columns) are _rejected_
  under strict, so a client cannot echo a fetched row back into
  `replace` — an owner-column spoof gets named instead of silently
  overwritten. The request-body component gains
  `additionalProperties: false` natively. On an override,
  `input: z.object({...}).strict()` is the equivalent spelling. Opt-in
  per operation — stripping stays the default. Only valid on
  `create` / `update` / `replace`.

#### Capability matrix (meta → layers)

| Meta flag | Entity compiler | DTO projection | E2E reference |
|-----------|-----------------|----------------|---------------|
| `db.pk` | `@PrimaryGeneratedColumn('uuid')` | update id | tag, pet |
| `db.createdAt` / `updatedAt` / `deletedAt` | audit decorators | create/update omit | auditableEntity |
| `db.unique` / `db.index` | column / class decorators | — | pet `uniqueRef` |
| `db.column` | raw TypeORM override | — | `zod-full-coverage` decimal/json |
| `rocketsEntityMeta.unique` / `indexes` | composite constraints | — | pet-tag, full-coverage |
| `relation.manyToOne` | FK + `@JoinColumn` | expose nested | zod-library author/book |
| `relation.hasMany` | `@OneToMany`, no column | expose array | full-coverage, pet |
| `relation.shape` | — | classic entity expose | pet vaccinations |
| `dto.create/update/response` | — | projection | zod-library |
| `compute` | skipped (no column) | response only | pet `tags` |
| `owner` | — | OwnerStampHook | pet |

Unsupported without `db.column`: arbitrary zod types (record, union, …).
Many-to-many: junction sub-resource + two FKs — no `@ManyToMany`.

#### Response exposure is opt-in (secrets are explicit)

The response DTO mirrors the project's classic idiom — class-level
`@Exclude()` + per-field `@Expose()` — derived from the schema:

| You write | On the wire? |
|---|---|
| `name: f.string()` | yes — every `f.*` helper registers `response: true` |
| `id: f.pk()`, `f.createdAt()`, … | yes — base-entity columns expose by default |
| `legacy: z.string()` (raw zod, no meta) | **no** — forgetting to annotate fails closed |
| `passwordHash: f.string({ dto: { response: false } })` | **never** — this is the `@Exclude()` equivalent, and it is mandatory for secrets |
| `userId: f.owner()` | yes — an opaque owner reference, like GitHub's `owner.id` or Stripe's `customer`; the UI needs a stable key to group by author |
| `userId: f.owner({ dto: { response: false } })` | **no** — opt out where the owner id has no business on the wire (typically `ownerScope: false` resources whose rows are visible to non-owners) |

There is deliberately **no name-based heuristic**: a column named
`apiKey` or `passwordHash` written with an `f.*` helper IS exposed until
you opt it out. Audit tip: `grep -rn "response: false" src/` lists every
hidden column in one command.

`f.compute` fields are response-only and are additionally stripped at
runtime to their declared shape — hidden or undeclared keys of embedded
rows never serialize.

#### Custom row scoping (group / dealer / tenant) — opt-in, never default

Owner scoping (`f.owner()` → rows filtered by `actor.id`) is the only
scoping the framework wires automatically. Anything richer — "dealer
users see every row of _their_ dealer", tenant columns, shared-access
rules — is deliberately **opt-in, written by the consumer**. The
pieces:

1. **Carry the group id on the actor.** Your auth adapter owns this:
   put it in `Actor.metadata` (the designated free-form bag —
   `{ dealerId: 'dealer-7' }`), sourced from a token claim or a DB
   lookup.
2. **Write a scope hook** (~20 lines). `ownerScope: false` turns the
   per-user filter off; your hook takes its place:

   ```ts
   @EntityHook({ entity: UserEntity })
   @Injectable()
   export class DealerScopeHook extends PassthroughEntityHookBase<PlainLiteralObject> {
     override async beforeFindAndCount(options, ctx?) {
       const dealerId = getActor(ctx)?.metadata?.dealerId;
       return withAndWhere(options, Where.eq('dealerId', dealerId));
     }
     // beforeFindOne likewise — read/update/delete route through it.
   }

   zodResource({
     name: 'User',
     schema: userSchema,      // declares the dealerId column
     ownerScope: false,       // off: per-user; on duty: per-dealer
     hooks: [DealerScopeHook],
   });
   ```

   Working references, both shipped in `examples/sample-server`:
   `reminder-owner-scope.hook.ts` (indirect ownership through a parent
   row) and `pet-owner-or-shared.hook.ts` (owner OR share-grant).
3. **Admin sees everything via a separate surface**, not a bypass:
   `/admin/users` behind an `AdminGuard`, backed by a service that
   injects the repository directly (no scope hook). See
   `examples/sample-server/src/admin/`. Hooks never learn about roles —
   the actor they receive is narrowed to `{ id, type, metadata }` on
   purpose, so authorization stays in guards.

A declarative version of this recipe (scope policies + ACL-possession
bypass) is under discussion:
<https://github.com/conceptadev/rockets/discussions/32>.

### Add role-based access control (opt-in `accessControl`)

ACL is opt-in. Pass the `accessControl` option (type
`RocketsAccessControlConfig`, exported from `@concepta/rockets-core`) and core
registers the upstream `AccessControlModule` from
`@concepta/nestjs-access-control` — including the guard and any `CanAccess`
query services. When the option is omitted, no ACL module, guard, or provider
is registered at all. Route decorators and interfaces are imported directly
from `@concepta/nestjs-access-control`:

```typescript
import { AccessControlReadOne } from '@concepta/nestjs-access-control';

RocketsCoreModule.forRoot({
  // ...auth, repository, resources
  accessControl: {
    service: new AcService(), // AccessControlServiceInterface
    settings: { rules: acRules },
    // optional: appGuard, appFilter, imports, queryServices (CanAccess)
  },
});

@Controller('pets')
class PetController {
  @Get(':id') @AccessControlReadOne('pet') read() {
    /* ... */
  }
}
```

### Assert what every route enforces (`routePolicy`)

Declare what must be true of every HTTP route the application ends up
with. The check runs at bootstrap, so it covers **every** discovered
controller — generated CRUD, operation resources, module resources,
hand-built configs, and controllers owned by other packages such as
the `/me` controller (`buildMeController` in `@concepta/rockets`) or the
`rockets-server-auth` routes.

```typescript
RocketsCoreModule.forRoot({
  // ...
  accessControl: { settings: { rules: acRules } },
  routePolicy: {
    requireAuth: true,
    requireAcl: true,
    allow: ['GET /health'],
  },
});
```

A violation stops the boot and names every offending route at once:

```text
Rockets route policy rejected 2 routes:
  - [requireAcl] GET /invoices/summary: InvoiceController.summary carries no
    AccessControlGrant. Upstream returns true for a route with no grant
    metadata, so this route is authenticated but open. ...
```

| Rule | Fails when |
| --- | --- |
| `requireAuth` | a route is `AuthPublic`, or no global guard is recognised as an AUTHENTICATION guard |
| `requireAcl` | an authenticated route carries no `AccessControlGrant` |
| `requireAclQuery` | a granted route names no `CanAccess` service, so `own` possession widens to every row — declare it only once every resource's `acl` names a `query` service |

"Recognised" is deliberate: `AuthServerGuard` counts automatically; any
other guard that authenticates your app must be listed in
`routePolicy.authGuards`. The audit refuses to assume that the mere
presence of a global guard means authentication — a throttler, an ACL
guard, or upstream access-control's disabled-guard factory (registered
unconditionally, resolving to `null` under `appGuard: false`) are global
guards that authenticate nothing, and counting them would report an
unauthenticated app as protected.

Exemptions are explicit — `allow` takes route ids, `allowControllers`
takes classes (matched by identity, so a same-named class from another
package is not exempted with it) — because an exemption that silently
widens as routes are added is the failure this whole check exists to
remove. Two properties keep the list honest: an `allow` entry exempts
its route from EVERY declared rule, not just the one it was added for;
and, while at least one rule is declared, an entry matching no
discovered route fails the boot as `staleAllow`, so the list cannot rot
where it matters.

**Why bootstrap and not plan time.** `buildAppRegistrationPlan` already
rejects route collisions and ungranted operations, but it only sees what
it generates and it runs before controllers are built, so a hand-written
`AccessControlGrant` inside a bundle's `decorators: []` is invisible to
it. This closes that gap, and its own documentation says so.

**Reporting without enforcing.** `RouteAuditService` is always registered
and injectable — omit `routePolicy` and no policy rule is enforced, but
`audit()` still gives you the full table for a CI artifact, and the
always-on checks still run: a `@Body/@Query/@Param({ schema })` parameter
that no `StandardSchemaValidationPipe` reaches fails the boot as
`requireSchemaPipe` (Nest installs no pipe for `schema`; the parameter
would be documented and unvalidated — exempt a route validated some other
way through `allowUnvalidatedSchema`, not `allow`), and a hand-written
`@SerializeOptions({ schema })` with an open object anywhere in it fails
as `requireClosedResponse`.

```typescript
const { routes, globalGuards, authGuards } = app.get(RouteAuditService).audit();
```

`authGuards` — not `globalGuards` — is what decides `guarded`.

Route ids are `METHOD /controller/handler` paths. Global prefix and Nest
versioning are applied by the HTTP adapter after this runs, so ids stay
stable against those settings rather than matching the wire path. A
controller or handler declared with an array of paths produces one row
per combination.

Apps composed through `@concepta/rockets` pass the same option as
`RocketsModule.forRoot({ routePolicy })`. The `AuthServerGuard` that
module registers is recognised automatically, and an auth bootstrap that
swaps the global guard (`defineRocketsAuth` installs upstream
`JwtGuard`) contributes its guard class through the same composition —
no `authGuards` declaration needed for either. `authGuards` remains for
guards nothing declares: a hand-registered `APP_GUARD` class of your
own.

`allow` entries are staleness-checked only while at least one rule is
declared; a recognition-only policy polices nothing. Routes removed
conditionally (`disableController`) live in the same options object as
the policy — keep the two consistent per environment.

### Export a stable OpenAPI contract

`SwaggerUiService.createDocument(app)` returns the exact OpenAPI document
`SwaggerUiService.setup(app)` mounts — `setup()` calls it internally, so the
two cannot drift. Use it to pin the wire contract as a committed artifact:

```typescript
const document = app.get(SwaggerUiService).createDocument(app);

// Per-call document options (e.g. `extraModels`) override the configured
// `settings.documentOptions`:
const document = app.get(SwaggerUiService).createDocument(app);
```

Do not rebuild the document from `builder().build()` by hand: only
`createDocument` installs the Rockets schema converter that turns every
named schema into a `$ref` (`components/schemas/<id>`). An app that
post-processes its document would pin something it never serves. Wrap
the real steps once in a `createOpenApiDocument(app)` helper and call it
from both `main.ts` and the contract spec.

Both example apps ship the reference version — an e2e spec that regenerates
or diffs `contract.json` against that document on every CI samples run.
`examples/sample-server` covers zod CRUD resources, zod sub-resources and
`operationResource` ops; `examples/sample-server-auth` covers the class-based
`defineResource` + built-in auth surface. See `CONFIGURATION.md` §6b for the
full pattern and the regeneration workflow.

### Rate-limit a route

`@RateLimit()` marks one route; `RateLimitGuard` enforces it. A route
without the decorator is never touched by the guard.

```typescript
import { APP_GUARD } from '@nestjs/core';
import {
  RateLimit,
  RateLimitGuard,
  RATE_LIMIT_STORE_TOKEN,
  InMemoryRateLimitStore,
} from '@concepta/rockets-core';

@Controller('reports')
class ReportsController {
  @Get()
  @RateLimit({ limit: 10, windowMs: 60_000 })
  list() {
    /* … */
  }
}

@Module({
  providers: [
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: RATE_LIMIT_STORE_TOKEN, useClass: InMemoryRateLimitStore },
  ],
})
class AppModule {}
```

`InMemoryRateLimitStore` is the reference adapter — correct for tests
and single-process apps, not for more than one instance (each process
would track its own count). A real multi-instance deployment needs a
shared backend behind `RateLimitStoreInterface`; see `CONFIGURATION.md`
§7c for a dynamic-repository store that never loses a concurrent
attempt, why the obvious read-increment-write counter row does, and the
limits of that shape — it needs a backend with monotonic generated ids,
its `COUNT` is O(rows in the window), and a route facing real hostile
volume wants Redis rather than your primary database. On over-limit the
guard rejects with `429` and `Retry-After`; on a store failure it fails
**closed** (`503`), never lets the request through unlimited.

Two things to get right when registering it:

- **Guard order.** Nest short-circuits on the first global guard that
  rejects, so a guard registered before `RateLimitGuard` hides traffic
  from it — an unauthenticated request to a protected route is rejected
  by the auth guard and consumes zero rate-limit budget. Register
  `RateLimitGuard` first if you want it to count every request. Public
  routes (login, signup, recovery), the usual target, are unaffected
  either way.
- **`request.ip` behind a proxy.** The default key is
  `ip:METHOD:route`. An app behind a reverse proxy must set
  `app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal'])`
  (or whatever matches its topology) in the host bootstrap, or all
  callers collapse into the proxy's single IP bucket. Rockets does not
  enable it automatically — trusting unverified forwarding headers lets
  clients spoof their address and evade the limit.

---

## 4. Reference

### Upstream engine

| Motor (`@concepta/nestjs-*`)                     | Import path                                    | What core does with it                                                                            |
| ------------------------------------------------ | ---------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `repository`                                     | `@concepta/rockets-core` (re-export)            | `buildAppRegistrationPlan` calls `repository.forRoot(entities)` and `forFeature` per resource row |
| `crud`                                           | `@concepta/rockets-core` (re-export)            | Each `defineResource` becomes a `CrudModule.forFeature` import                                    |
| `core`, `authentication`                         | `@concepta/rockets-core` (re-export)            | `CoreModule.forRoot` (hook resolution) in `createCoreImports`; swagger UI is core's own module    |
| `access-control`                                 | `@concepta/nestjs-access-control` (direct)     | Opt-in: the `accessControl` option registers `AccessControlModule`; omitted → no ACL wiring       |

Core **does not** fork upstream behaviour — it only expands `resources[]`,
`userMetadata`, and `auth` integrations into the module graph those packages
expect.

### `RocketsCoreModule.forRoot(options)`

| Option         | Type                                                 | Required  | Description                                                                                                                                                                                                                          |
| -------------- | ---------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `auth`         | `AuthBootstrap` or array                             | optional† | Auth wiring from `defineFirebaseAuth()`, `defineRocketsAuth()`, or app-local helpers. Each entry supplies an `adapter` and optional `forRoot()`. `identity`/`contributes` are resolved only by `@concepta/rockets` (`createServer` / `RocketsModule`) — core rejects bootstraps that still carry them; pass `userMetadata`/`repository`/`resources` explicitly here instead. |
| `repository`   | `RepositoryModuleInterface` or `RepositoryBootstrap` | optional  | Default persistence adapter. A bootstrap owns both `forRoot(entities)` and `forFeature(entities)`.                                                                                                                                   |
| `userMetadata` | `RocketsUserMetadataConfig`                          | optional  | Entity + DTOs for the metadata table joined to external users.                                                                                                                                                                       |
| `resources`    | `ReadonlyArray<ResourceInput>`                       | optional  | Mix of `defineResource`, `defineModuleResource`, and manual `RocketsResourceConfig`.                                                                                                                                                 |
| `handlers`     | `{ upsertUserMetadata?, getUserMetadata? }`          | optional  | Override default metadata CQRS handlers.                                                                                                                                                                                             |
| `accessControl` | `RocketsAccessControlConfig`                        | optional  | Opt-in ACL: `{ service, settings: { rules }, appGuard?, appFilter?, imports?, queryServices? }` forwarded to upstream `AccessControlModule.forRoot`. Omitted → no ACL wiring.                                                        |
| `providers`    | `Provider[]`                                         | optional  | Extra providers registered on the module.                                                                                                                                                                                            |
| `global`       | `boolean` (default `true`)                           | optional  | Module is global — exports visible app-wide.                                                                                                                                                                                         |
| `swagger`      | `SwaggerUiOptionsInterface`                          | optional  | Swagger UI customization (`settings`, `documentBuilder`). Core always registers Swagger UI; this only tunes it.                                                                                                                      |

† `auth` is required at the presentation layer (e.g. `@concepta/rockets` always
needs an auth source). Core itself boots without it for tests.

### `AuthAdapterInterface`

```typescript
interface AuthAdapterInterface {
  authenticate(request: AuthRequest): Promise<AuthAttemptResult>;
}

type AuthAttemptResult =
  | { matched: false } // not this adapter's credential
  | { matched: true; user: AuthorizedUser } // recognised and validated
  | { matched: true; error: HttpException }; // recognised but rejected

interface AuthorizedUser {
  id: string;
  sub: string;
  email?: string;
  userRoles?: { role: { name: string } }[]; // shape required for RBAC
  claims?: Record<string, unknown>;
}
```

The guard iterates adapters in order. `{ matched: false }` → try next.
`{ matched: true; user }` → stop, attach user. `{ matched: true; error }` →
stop, throw.

### Helpers

| Symbol                                                  | Purpose                                                                |
| ------------------------------------------------------- | ---------------------------------------------------------------------- |
| `defineResource(input)`                                 | CRUD bundle: entity + DTOs + operations + hooks → auto-controller.     |
| `defineModuleResource(input)`                           | Non-CRUD bundle: entities + Nest module slice.                         |
| `defineSubResource(input)`                              | Nested resource (e.g. `/pets/:petId/tags`) with path-scope guard.      |
| `defineOperationResource(input)`                        | Typed non-CRUD endpoints with a generated controller (issue #43).      |
| `operationResource` + `op.read`/`op.write`/`op.delete`  | Zod-first builders for `defineOperationResource` (issue #50).          |
| `relation(target, prop, opts?)`                         | Type-safe cross-resource relation.                                     |
| `extractBearerToken(request)`                           | RFC 7235 Bearer parser for adapter implementations.                    |
| `getActor(ctx)`                                         | Read authenticated user from a CRUD context.                           |
| `getCrudContext(ctx)`                                   | Read the full CRUD context (request, params, …).                       |
| `OwnerStampHook.for(Entity, column?)`                   | Stamp `userId` on create/update.                                       |
| `defineHook(Entity, fns)`                               | Functional entity hook (lifecycle fns + `tools.repo` / `tools.actor`). |
| `OwnerScopeHook.for(Entity, column?)`                   | Filter list/read/update/delete by `userId`.                            |
| `AfterCreateReloadHook.for(Entity)`                     | Reload an entity after create (for eager relations).                   |
| `PathScopeHook.for(Entity, paramName, fkColumn)`        | Filter sub-resource by parent URL param.                               |
| `PathScopeGuard.for(paramName, parentKey, ownerColumn)` | Verify actor owns the parent.                                          |
| `AuthServerGuard`                                       | Bearer-token / multi-adapter guard. Opt-in via `APP_GUARD`.            |
| `@AuthPublic()`                                         | Decorator to skip the global guard on a route.                         |
| `AUTH_ADAPTERS_TOKEN`                                   | Inject the configured adapter chain.                                   |
| `@AuthSession()`                                        | Marks a route session-cookie authenticated + CSRF-protected (#58).     |
| `CsrfGuard`                                             | Enforces CSRF on `@AuthSession()` routes; no-ops elsewhere (#58).      |
| `generateCsrfToken` / `verifyCsrfToken`                 | Signed double-submit CSRF token mint/verify (#58).                     |
| `parseCookies(header)` / `extractCookie(request, name)` | Parse the raw `Cookie` header; duplicates are first-wins (#58).        |

---

## Final Review Checklist

Start with the
[root checklist](../../README.md#final-review-checklist), then verify the core
specific rules:

- Keep core policy-free. `OwnerScopeHook` scopes to an owner; `PathScopeGuard`
  verifies parent ownership. Role bypasses belong in app/auth policy code.
- Keep zod storage adapter-agnostic. Zod metadata describes schema intent;
  concrete entity generation stays behind `SchemaEntityCompiler`.
- Keep `zodResource({ owner })` as owner-column stamping/metadata only. Add
  read scoping explicitly with `OwnerScopeHook` or a custom hook.
- Register persistence through `repository` + `resources[]`; do not add
  feature-local `TypeOrmModule.forFeature()`.
- When changing public exports, confirm the symbol is real runtime surface and
  documented here.
- Run `yarn build`, `yarn typecheck:spec`, `yarn test`, `yarn test:e2e`, and
  `yarn lint:all` from the
  repository root.

---

## License

BSD-3-Clause
