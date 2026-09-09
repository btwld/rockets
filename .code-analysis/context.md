# Rockets — Project Context

Ground truth for automated auditors. Findings that contradict this document are
likely false positives — check here first. Where this file and `packages/*/src/`
disagree, **the code wins** (same rule as `AGENTS.md`).

## What this project is

Rockets is a **pre-1.0 TypeScript/NestJS monorepo** (Yarn 4 workspaces, Lerna,
BSD-3-Clause) published to npm under `@bitwild/*` with dist-tag `alpha`. It is a
*framework for building backends*, not a product backend. There is no end-user
domain here — no billing, no CRM, no orders. The "domain" of this codebase **is
backend infrastructure itself**: authentication wiring, CRUD registration,
repository plumbing, Swagger generation.

The core value proposition: you describe a feature once as a **configuration
object**, and the framework registers the Nest modules, providers, controllers,
and routes for you. **There is no codegen step** — everything happens at runtime
through Nest dynamic modules. Adding a feature means appending an object to a
`resources[]` array. An auditor should not flag "missing generated files" or
look for a build-time generator; none exists by design.

Critically, **Rockets is a composition layer, not an engine**. The motor is the
upstream `@concepta/nestjs-*` stack (repository, CRUD, hooks, access control,
and the identity modules), consumed from npm and re-exported. `@bitwild/*`
packages are largely **curated re-exports plus wiring**. Rockets is explicitly a
*consumer and configuration façade — not a fork* of Concepta. So: thin packages
that mostly re-export are **intentional**, not a code smell.
`rockets-repository-typeorm` has only ~330 LOC of source because its main entry
re-exports upstream verbatim; that is the design, not an incomplete
implementation.

## Tenancy model

**Read this section carefully — it is the most common source of wrong audit
findings.**

Rockets has **no first-class multi-tenancy**. There is no tenant, organization,
workspace, or account entity anywhere in `packages/*/src`. I verified this: the
string "tenant" appears 10 times in the entire package source, and *every*
occurrence is a test fixture, a doc comment, or a Firebase claim passthrough —
never a schema, guard, or query filter. Do **not** report "missing tenant
isolation", "tenant id not filtered", or "cross-tenant data leak" as defects.
The framework deliberately has no such concept.

The actual isolation boundaries are three, in order:

**1. The authenticated user (row level).** The unit of isolation is
`AuthorizedUser.id`, and the boundary column defaults to `userId`
(`DEFAULT_OWNER_COLUMN`). Row scoping is achieved by two **opt-in**, paired
repository hooks from `@bitwild/rockets-core`:

- `OwnerScopeHook.for(Entity)` — read path. `beforeFindAndCount` /
  `beforeFindOne` inject `Where.eq(ownerColumn, actor.id)`, covering
  list/read/update/delete (update and delete route through `findOne`). Create is
  not scoped here.
- `OwnerStampHook.for(Entity)` — write path. `beforeCreate` / `beforeUpdate`
  stamp the owner column from the actor, **silently overwriting any
  client-supplied value** — owner spoofing is impossible by construction.
  `stampOn: 'create'` deletes the column on update, making ownership immutable.

They run at the **repository layer**, so non-HTTP callers are scoped too. Both
accept a column override.

Three properties matter for auditing. First, the hooks are **opt-in per
resource** — a `defineResource({ entity })` with no `hooks[]` is **not**
owner-scoped, which is legitimate for genuinely shared data. Absence is not
automatically a vulnerability; judge it against what the resource holds.

Second, and load-bearing: **the two hooks are deliberately asymmetric on a
missing actor.** `OwnerStampHook` **fails closed** (throws
`UnauthorizedException`). `OwnerScopeHook` **fails open** (returns options
unfiltered). This asymmetry is documented intent, not an oversight — the guard is
expected to have already rejected unauthenticated requests, so an actor-less
read implies a public route that should not be scoped. The consequence is that
**correctness rests on route configuration**: a scoped route wrongly marked
public returns every row rather than erroring. Report that only with a concrete
route that actually reaches it — the branch existing is not itself the bug.

Third, the actor overlay **narrows `AuthorizedUser` to `{ id, type }`** before
hooks see it; roles and claims are intentionally dropped so hooks compile
outside HTTP. Full chain: `AuthServerGuard` sets `request.user` → `ActorOverlay`
derives the `Actor` → `getActor(ctx)` in the hook → `Where` clause.

Zod resources auto-wire **both** owner hooks from field metadata
(`f.owner()` / `{ owner: true }`): the write-path stamp and the read-path
scope, symmetrically. Opt out per direction with `ownerStamp: false` /
`ownerScope: false`. (This does not change the runtime hook's own
fail-open-on-missing-actor semantics described above.)

**Nested resources** are scoped by `PathScopeGuard` (auto-injected by
`defineSubResource`), which verifies the **parent** row belongs to the actor
before nested routes run, and returns **404 rather than 403** so strangers
cannot probe existence. That 404 is deliberate — do not "fix" it to 403. This is
parent-child scoping, not tenant scoping.

**2. The deployment (service level).** Each Rockets app is a **micro app**
owning one domain and its own database. Cross-domain isolation is achieved by
*being a separate deployment*, not by a discriminator column. There is **no
multi-database, schema-per-tenant, or connection-per-tenant support**, and no
request-scoped datasource resolution: an app runs a single connection (or a
single Firebase app) holding the union of its entities. Absence of connection
routing is by design.

**3. Roles / ACL (operation level).** Access control is **opt-in**. Passing the
`accessControl` option to `RocketsModule.forRoot` registers upstream
`@concepta/nestjs-access-control` (guard, grant table, query services). **When
the option is omitted, no ACL wiring exists at all** — that is documented,
intended behavior, not a missing guard.

Access control is **not roles-only**; it is two cooperating layers:

- **RBAC** via the `accesscontrol` library's grant grammar, where the
  *possession* axis (`readAny` vs `readOwn`, etc.) is where ownership enters.
  Typical grants: `admin` → `*Any`; `user` → `*Own`.
- **Ownership / attribute checks** via `CanAccess` query services, wired per
  route with `AccessControlQuery({ service })` and registered through
  `queryServices: [...]`. On `possession === 'any'` they allow; on `'own'` they
  load the row and compare the owner column to the actor. **For list
  operations they return `true` and delegate filtering to the hook layer** —
  the query service authorizes, `OwnerScopeHook` filters. A query service that
  doesn't filter lists is therefore *correct*, not a hole.

Roles come from `AuthorizedUser.userRoles` (`{ role: { name: string } }[]`),
surfaced to the guard via `AccessControlServiceInterface.getUserRoles()`. On the
built-in path they are resolved **from the database per request** via CQRS, and
the JWT's own roles claim is **deliberately ignored** so revocation takes effect
immediately — do not flag that as a redundant lookup or an unused claim. The
Firebase adapter differs by design: roles come from a token custom claim with no
DB round-trip.

Where a real deployment needs a tenant, it attaches one as **application-level
data**: `Actor.metadata` is an explicit free-form bag documented to carry
"tenant id, impersonation chain, source channel" without forcing a new field
into every call site. Tenancy is a *consumer* concern that Rockets accommodates
but does not implement.

**Shared identity across micro apps.** The enterprise shape is **Stargate**, a
workflow/orchestration platform (n8n-like) that provisions micro apps. The
governing rule: **one issuer, many micro apps**. Every micro app points its
`AuthBootstrap` at the same project/secret so `AuthorizedUser.id` matches
everywhere. Scaffolding `defineRocketsAuth()` with a separate user DB per micro
app is explicitly called out as **breaking SSO** — an anti-pattern. Multiple
adapters in `auth: [...]` are supported *only* when each credential resolves to
the **same** `AuthorizedUser.id` (e.g. Firebase for users + API key for
automation).

## The two paths

There are **two deployment paths**, chosen by *where your users live*. Code that
looks duplicated between them often isn't — it serves different paths.

**Path A — external identity** (`@bitwild/rockets`, package `rockets-server`).
Users live in Firebase, Auth0, Okta, or a custom JWT issuer. You supply an
`AuthAdapterInterface`; the framework gives you a global guard, `/me`,
declarative CRUD, hooks, Swagger. Primary choice for Stargate micro apps.

**Path B — built-in identity** (`@bitwild/rockets-auth`, package
`rockets-server-auth`). The app *is* the user system: signup, login, recovery,
OTP, invitations, admin user CRUD, roles — via one `defineRocketsAuth()` call.

Both paths share the lower layers (planner, dynamic repository, hooks, Swagger),
so a feature added to one runs identically on the other.

## Domain vocabulary

| Term | Meaning |
|---|---|
| **Motor / engine** | The upstream `@concepta/nestjs-*` stack. Rockets calls it; does not replace it. |
| **Composition** | What Rockets owns: turning options into Nest modules. |
| **Resource** | A feature described as config. `defineResource()` = CRUD-shaped, auto-contributes its entity row. |
| **Module resource** | `defineModuleResource({ entities, module })` — a non-CRUD Nest slice; `entities: []` is valid for CQRS-only workflows without generated HTTP. |
| **Sub-resource** | `defineSubResource()` — nested CRUD (`/pets/:petId/tags`), scoped via `PathScopeHook` + `PathScopeGuard` (parent-ownership check, 404 on miss). |
| **Operation resource** | `operationResource()` / `defineOperationResource()` — typed non-CRUD HTTP (generated controller; Zod `input`/`output`; `op.read`/`op.write`/`op.delete`). |
| **Planner** | `buildAppRegistrationPlan({ resources, repository, userMetadata })` → `{ crudResources, entityRegistrations, nestModules }`. Where "one options object" becomes Nest modules. Includes cross-resource route collision checks for operation + CRUD paths. |
| **Auth adapter** | `AuthAdapterInterface.authenticate()` → `{matched:false}` (try next) \| `{matched:true,user}` (stop) \| `{matched:true,error}` (stop + throw). |
| **Auth chain** | `AuthServerGuard` iterating `auth: [...]`. No silent credential passthrough. |
| **AuthorizedUser** | `{ id, sub, email?, userRoles?, claims? }`. Read via `@AuthUser()` or `getActor(ctx)` in CQRS handlers. |
| **Actor** | Transport-agnostic "who did this" — `{ id, type: 'user'\|'system'\|'service', metadata? }`. Deliberately omits HTTP concerns so hooks compile in jobs/CLI. |
| **Dynamic repository** | `@InjectDynamicRepository(KEY)` + `RepositoryInterface<T>`. **Never `@InjectRepository`.** |
| **Repository adapter** | Concrete backend (TypeORM / Firestore) selected in module options. One root `repository`, per-entity override allowed. |
| **User metadata** | `userMetadata` config — profile row keyed by auth id, exposed on `/me`. |
| **Hooks** | Core's own `EntityHook` / `defineHook`, built on `@concepta/nestjs-repository`'s `RepoHook` + `Before*`/`After*` decorators. Owner/path scoping ships as hooks. Throwing a bare `Error` — or even an `HttpException` — from a hook surfaces as **500**; throw domain exceptions from `@concepta/nestjs-common` so filters map them to 4xx. |
| **Zod resource** | `zodResource()` / `zodSubResource()` / `operationResource()` at the `/zod` subpath — schema-first path. |
| **SchemaEntityCompiler** | Adapter contract that keeps the zod layer **ORM-free** by delegating entity generation. |
| **Micro app** | One Rockets deployment owning one domain, trusting shared identity. |
| **Stargate** | External workflow platform that orchestrates and provisions micro apps. Not in this repo. |

## Intended architecture

**Package layering** (dependency direction, all depend on `rockets-core`):

- **`rockets-core`** (`@bitwild/rockets-core`, ~11.6k LOC) — shared
  infrastructure. Auth abstraction (`AuthAdapterInterface`, `AuthServerGuard`),
  CQRS handlers, declarative resources + planner, root `repository` +
  `userMetadata` config, Swagger registration, opt-in `accessControl`, shared
  decorators/utils, and the zod-first layer at the `/zod` subpath
  (`zodResource`, `operationResource`, …). Imported by both server and auth.
  Registered `global: true`.
- **`rockets-server`** (`@bitwild/rockets`, ~5.4k LOC) — Path A presentation +
  composition. `MeController`, `APP_GUARD` opt-in, `auth` chain.
- **`rockets-server-auth`** (`@bitwild/rockets-auth`, ~9.9k LOC) — Path B built-in
  identity. Domains: `auth`, `invitation`, `oauth`, `otp`, `role`, `user`.
- **`rockets-repository-typeorm`** (~330 LOC) — thin wrapper; main entry
  re-exports upstream verbatim. Owns only the `/zod` TypeORM compiler.
- **`rockets-repository-firestore`** (~1.8k LOC, *preview*) — Firestore adapter.
- **`rockets-adapter-firebase`** (~685 LOC, *preview*) — Firebase auth adapter.

**The layer rule** (from `AGENTS.md`, the canonical contract): before placing a
component ask *"Would `rockets-server-auth` also need this?"* Yes → core. No →
server. **Controllers belong in server or auth, never in core. Swagger IS in
core** (both paths need docs from a single registration). Access control is core
too. All four are honored in the code today.

**Internal layering is DDD-ish and unevenly applied — by acknowledged
migration, not drift.** `rockets-core` is consistent (`domain/interfaces`,
`application/{commands,queries}`, a large `infrastructure/`, plus `common/`
holding absorbed ex-`rockets-common` helpers annotated with their origin).
`rockets-server-auth` is **mid-migration**: `domains/invitation` is fully
layered, `domains/auth` has no `domain/` layer, `domains/oauth` is parked, and
flat legacy files (`provider/`, `define-rockets-auth.ts`, the `shared/`
grab-bag) sit alongside. `rockets-server`'s `domain/` and `infrastructure/`
trees are **vestigial** — 1–5 line re-export shims pointing at core; only
`MeController`, the module-definition, and `define-typeorm-repository.ts` hold
real logic. Do not file "inconsistent layering" as a blanket finding; a
`rockets-ddd-refactor` migration is in flight.

**Two parallel composition roots.** `rockets-server-auth` does **not** import
`RocketsCoreModule`. It cherry-picks `buildAccessControlImport` and
`SwaggerUiModule` from core and re-does its own wiring. Expect
duplicated-looking composition between the two paths.
Relatedly, the layers disagree on one field: `rockets-server` **requires**
`userMetadata` and throws at DI time, while core treats it as optional.

**Load-bearing constraints an auditor should treat as intent, not deviation:**

*Persistence is database-agnostic by default.* The supported contract is
`RepositoryInterface` + dynamic repository keys. Concrete backends are selected
in module options and **must remain swappable**. `rockets-core` public design,
types, and docs must **not** hard-require a specific ORM. Examples using TypeORM
do not make TypeORM the definition of Rockets storage. Feature/server code
imports repository symbols from `@bitwild/rockets-core` (which re-exports them);
only core and adapter packages import from `@concepta/nestjs-repository`
directly. **This indirection is deliberate** — do not flag it as a needless
re-export layer.

*Dependency direction is one-way.* Everything depends on `rockets-core`; **nothing
depends on `rockets-server` or `rockets-server-auth`**. Core's only link to
TypeORM is a **devDependency** (for testing), which is what keeps rule 13 true in
practice — do not report it as a production ORM coupling.

*Zod is the schema engine.* `zod` is a regular `dependency` of
`@concepta/rockets-core` (the upstream `@concepta/nestjs-*` stack depends on it
the same way); every request and response contract is a named zod schema
(`withOpenApi(schema, id)`). `nestjs-zod`, `class-validator` and
`class-transformer` are gone from the Rockets manifests — an import of any of
them in `packages/*/src` is a finding, except `@concepta/rockets-auth`, which
keeps the two class libraries as plain dependencies while `nestjs-email` /
`nestjs-event` (7.x) require them at import.

*Resource config is flat.* `RocketsResourceConfig` extends
`CrudModuleForFeatureOptionsInterface` directly. No `crud.crud` nesting.
Handlers in `operations[].queryHandler` / `commandHandler` are auto-extracted by
core and must **not** be duplicated in `resource.providers`.

*One root adapter; every bundle owns its own entity.* Entities are registered
through `resources[]` bundles plus `userMetadata.entity` — **never** via a
module-local `TypeOrmModule.forFeature()`. There is no `repositories.entities[]`
block. Registering the same entity twice is exactly what this prevents.

*Module resource exports are a public surface.* Because core is `global: true`,
anything in `defineModuleResource({ module: { exports } })` becomes injectable
app-wide. Collisions are **by injection token** — the same class reference or
the same string/symbol value shadow each other silently (last one wins). Export
the minimum: cross-boundary providers only. Two distinct classes sharing a
*name* are different tokens and don't hard-collide, but are still a foot-gun.
`sample-server`'s `authFeature` is the canonical reference.

*Never lose `defImports` in a `definitionTransform`* — always merge
`imports: [...defImports, ...]`, or `forRootAsync` wiring (RAW_OPTIONS_TOKEN)
silently breaks.

*Swagger comes from the schema.* There are no DTO classes and no
`@ApiProperty()`. A request or response is documented because its zod schema
is named (`withOpenApi(schema, 'XDto')`, applied LAST) and `$ref`'d by the
Rockets document converter; hand-written routes declare
`@Body/@Query/@Param({ schema })`, `@ApiResponse({ standardSchema })`, and
carry `@UsePipes(new StandardSchemaValidationPipe(rocketsSchemaValidation))`.
A schema wrapped before its last `.extend()` / `.strict()` (id lost), or an
unnamed schema on a route, is a real finding.

*Type safety is absolute.* No `any`, no `as unknown as Type`, no
non-null-assertion workarounds. No bridge modules, lazy placeholders, fake
providers, or `--no-verify`. If stuck, the rule is to **ask**, not work around.

*No unused interface fields.* If a field isn't actively consumed, it is removed.

**Testing policy.** E2E/integration is the **default**, not the exception: new
tests are `*.e2e-spec.ts` (real Nest app + supertest + SQLite) unless a unit test
is specifically justified. Coverage target ≥80% statements/lines via
`yarn test:e2e:cov`. The runner is **Vitest 4** in the `projects` model (root
`vitest.config.ts` declares unit/e2e/example projects, `vitest.shared.ts`
holds the common settings; `pool: 'forks'` = fresh process per spec file;
`unplugin-swc` supplies the decorator metadata Nest DI needs; `globals` off —
tests import from 'vitest' explicitly). There is no `scripts/` directory and
no Jest anywhere. A known pre-existing rotating-404 full-run flake is
documented in CHANGELOG.md — do not report it as a new regression. Never
import a `domains/*/index` barrel inside an e2e file that also boots a Nest
app (barrels register CQRS metadata globally). A low *unit*-test count is not
a defect here.

**Stability.** The public surface (`AuthAdapterInterface`, `defineResource`,
`defineModuleResource`, `RepositoryInterface`, `RocketsModule.forRoot` options)
is treated as stable; field renames remain possible before 1.0.

## Known deviations — real, but already known

Places where the code **does not** match the contract above. Listed so an auditor
treats them as confirmations of known debt rather than novel discoveries. Still
legitimate findings — just not news.

- **Core deep-imports upstream internals.** `rockets-core/src/common/index.ts`
  imports from `@concepta/nestjs-crud/dist/...` because the symbol isn't in the
  upstream barrel; the comment admits it. Core violating the barrel discipline it
  enforces on everyone else, and it breaks on any upstream `dist` reshuffle.
- **Dead option.** `defineRocketsAuth`'s `rocketsDefaults.enableGlobalGuard` is
  destructured and discarded, never read. Breaks the no-unused-fields rule.
- **Two global-guard registration paths.** Core provides `AuthServerGuard` as a
  plain provider; `rockets-server` registers it as `APP_GUARD`; upstream may
  register its own `JwtGuard` as `APP_GUARD`. An app composing `RocketsModule` +
  `RocketsAuthModule` can end up with two global guards. `AuthUserContextOverlay`
  double-registration is likewise acknowledged in a comment but not prevented.
- **Test-only dependency cycles.** `rockets-core` devDepends on its downstream
  `rockets-repository-typeorm`; `rockets-server-auth` devDepends on downstream
  `@bitwild/rockets`. Runtime arrows stay clean; the build graph does not.
- **Stale pins.** `@concepta/nestjs-hook` is pinned in root resolutions but
  unused in package source; `@concepta/nestjs-event` is a declared dep of
  `rockets-server-auth` but appears only in an e2e helper.
- **OAuth is parked.** `domains/oauth/` exists but its barrel export is
  commented out pending upstream v8 packages.
- **Testing policy is aspirational.** `AGENTS.md` says e2e is the default, but
  `rockets-core` is 22 unit / 9 e2e, three placement conventions coexist
  (co-located `*.spec.ts`, `__e2e__/`, `__tests__/`), a `*.typetest.ts`
  convention exists that no test-runner config picks up (only a manual
  `tsc --noEmit` script), and unit thresholds in `vitest.config.ts` are
  50/40/50/50 — not the cited 80%.
- **`rockets-server` re-exports the `SchemaEntityCompiler` type but exposes no
  `/zod` subpath**, so consumers must dual-import from
  `@bitwild/rockets-core/zod` + `@bitwild/rockets-repository-typeorm/zod` —
  in tension with the "single `@bitwild/*` package" rationale.
- **`rockets-server` runtime-depends on `rockets-repository-typeorm`.** Core
  stays ORM-neutral; Path A's entry package does not.

---

## Flagged for your correction

Things I could not fully verify, or where sources disagree. Please confirm or
correct.

1. **Version drift, README vs package.json.** README says packages are at
   `1.0.0-alpha.9` on npm; the workspace `package.json` files show
   `1.0.0-alpha.10` for `rockets-core`, `rockets-server`, and
   `rockets-repository-typeorm`, while root is `1.0.0-alpha.9`. Separately,
   `rockets-server-auth`, `rockets-repository-firestore`, and
   `rockets-adapter-firebase` all sit at **`0.0.1`**, which does not match their
   README "alpha"/"preview" statuses. Is the `0.0.1` intentional (unpublished),
   or stale? I've avoided asserting a version in the doc body.

2. **DDD layering — is the migration in scope?** I've written it up as an
   acknowledged in-progress refactor (core consistent, server-auth partial,
   server vestigial) and told auditors not to file blanket "inconsistent
   layering" findings. But `AGENTS.md` never states DDD layering as a rule, so I
   inferred the target from the `rockets-ddd-refactor` skill. Confirm the target
   shape, and say whether half-migrated modules should be reported or ignored.

3. **Stargate.** Described in the README as the enterprise deployment shape, but
   there is no Stargate code in this repo. I've treated it as external context.
   Confirm it's a real separate product and that the "one issuer, many micro
   apps" rule is current.

4. **Audit scope.** I did not scope `examples/` (`sample-server`,
   `sample-server-auth`, `sample-code-review`) or the vendored `.context/`,
   `docs/code-analysis/` run artifacts. Examples are reference apps and arguably
   should be audited to a *lower* bar than packages. Confirm what's in scope.

5. **Upstream version mismatch is intentional.** README states `swagger-ui` (and
   `email`/`event` on the auth path) are still on Concepta v7 while the rest is
   v8 — "version-mismatched intentionally and tested in CI". Worth confirming, so
   an auditor doesn't file it as dependency rot.

6. **`OwnerScopeHook` fails open — intent vs. risk.** The hook returns rows
   *unfiltered* with no actor, while `OwnerStampHook` throws. Docs call the
   asymmetry intentional and I wrote it up that way, but it makes correctness
   depend on route config. I've told auditors to require a concrete reachable
   route before filing it; say the word and I'll invert that.

7. **Tenancy is a seam, not a feature.** `Actor.metadata` is the documented
   place for a tenant id, but nothing populates or reads it. If tenancy is on
   the roadmap this doc should say so; today it tells auditors tenancy is out
   of scope.
